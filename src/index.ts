interface Env {
	SENTRY_CLIENT_SECRET: string;
	BRRR_WEBHOOK_SECRET: string;
}

/**
 * Verify the Sentry webhook HMAC-SHA256 signature using the Web Crypto API.
 * Sentry signs the raw JSON body with the integration's client secret and
 * sends the hex-encoded digest in the `Sentry-Hook-Signature` header.
 */
async function verifySignature(
	body: string,
	signature: string,
	secret: string,
): Promise<boolean> {
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

	const digest = Array.from(new Uint8Array(signed))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Timing-safe comparison to prevent timing attacks
	if (digest.length !== signature.length) {
		return false;
	}

	const a = encoder.encode(digest);
	const b = encoder.encode(signature);
	return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Send a push notification via the brrr API.
 */
async function sendBrrrNotification(
	secret: string,
	title: string,
	message: string,
	openUrl?: string,
): Promise<void> {
	const response = await fetch(`https://api.brrr.now/v1/${secret}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			title,
			message,
			sound: "default",
			...(openUrl && { open_url: openUrl }),
		}),
	});

	if (!response.ok) {
		console.error(
			`brrr API returned ${response.status}: ${await response.text()}`,
		);
	}
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// Only accept POST requests
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		// Read the raw body (needed for both HMAC verification and parsing)
		const body = await request.text();

		// Verify the HMAC signature
		const signature = request.headers.get("sentry-hook-signature");
		if (!signature) {
			return new Response("Missing signature", { status: 401 });
		}

		const valid = await verifySignature(body, signature, env.SENTRY_CLIENT_SECRET);
		if (!valid) {
			return new Response("Invalid signature", { status: 401 });
		}

		// Only handle issue alerts (Sentry-Hook-Resource: event_alert)
		const resource = request.headers.get("sentry-hook-resource");
		if (resource !== "event_alert") {
			return Response.json({ ok: true, ignored: resource });
		}

		// Parse the webhook payload
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(body);
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}

		const data = payload.data as Record<string, unknown> | undefined;
		const event = data?.event as Record<string, unknown> | undefined;

		const eventTitle = (event?.title as string) || "Unknown event";
		const triggeredRule =
			(data?.triggered_rule as string) || "Unknown rule";
		const webUrl = event?.web_url as string | undefined;

		// Fire the brrr notification asynchronously so we can return 200 to
		// Sentry immediately (Sentry requires a response within 1 second).
		ctx.waitUntil(
			sendBrrrNotification(
				env.BRRR_WEBHOOK_SECRET,
				`Sentry: ${triggeredRule}`,
				eventTitle,
				webUrl,
			),
		);

		return Response.json({ ok: true });
	},
} satisfies ExportedHandler<Env>;
