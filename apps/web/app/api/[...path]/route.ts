const publicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const internalBaseUrl = process.env.API_INTERNAL_BASE_URL ?? publicBaseUrl;

const forwardedHeaderNames = ["authorization", "content-type"] as const;
const allowedRoutes = [
  { method: "GET", pattern: /^board$/ },
  { method: "GET", pattern: /^share\/[^/]+$/ },
  { method: "GET", pattern: /^incidents\/[^/]+\/report$/ },
  { method: "POST", pattern: /^auth\/request-magic-link$/ },
  { method: "POST", pattern: /^auth\/verify-magic-link$/ },
  { method: "POST", pattern: /^auth\/logout$/ },
  { method: "GET", pattern: /^staff\/me$/ },
  { method: "GET", pattern: /^staff\/incidents$/ },
  { method: "POST", pattern: /^staff\/incidents\/\d+\/intake-sources\/\d+\/import$/ },
  { method: "GET", pattern: /^staff\/reports$/ },
  { method: "GET", pattern: /^staff\/reports\/\d+$/ },
  { method: "POST", pattern: /^staff\/reports\/\d+\/create-case$/ },
  { method: "POST", pattern: /^staff\/reports\/\d+\/link-case$/ },
  { method: "POST", pattern: /^staff\/reports\/\d+\/out-of-scope$/ },
  { method: "POST", pattern: /^staff\/reports\/\d+\/invalid-or-insufficient$/ },
  { method: "POST", pattern: /^staff\/reports\/\d+\/notes$/ },
  { method: "GET", pattern: /^staff\/cases$/ },
  { method: "GET", pattern: /^staff\/cases\/queue$/ },
  { method: "GET", pattern: /^staff\/cases\/\d+$/ },
  { method: "GET", pattern: /^staff\/cases\/\d+\/voice$/ },
  { method: "GET", pattern: /^staff\/cases\/\d+\/intake-review$/ },
  { method: "GET", pattern: /^staff\/cases\/\d+\/audit$/ },
  { method: "POST", pattern: /^staff\/cases\/\d+\/actions$/ },
  { method: "POST", pattern: /^staff\/cases\/\d+\/publish$/ },
  { method: "POST", pattern: /^staff\/cases\/\d+\/relations$/ },
] as const;

export async function GET(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

type RouteContext = {
  params: {
    path: string[];
  };
};

async function proxyRequest(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  const upstreamPath = context.params.path.join("/");

  if (!isAllowedRoute(request.method, upstreamPath)) {
    return jsonResponse({ detail: "Not found." }, 404);
  }

  const upstreamUrl = new URL(`${internalBaseUrl.replace(/\/$/, "")}/${upstreamPath}`);
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers();
  for (const headerName of forwardedHeaderNames) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return jsonResponse({ detail: "Backend request failed." }, 502);
  }

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }
  responseHeaders.set("cache-control", "no-store");

  if ([204, 205, 304].includes(upstreamResponse.status)) {
    return new Response(null, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }

  if (!contentType?.includes("application/json")) {
    if (upstreamResponse.ok) {
      return new Response(await upstreamResponse.text(), {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    return jsonResponse({ detail: "Backend request failed." }, upstreamResponse.status);
  }

  return new Response(await upstreamResponse.text(), {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

function isAllowedRoute(method: string, path: string) {
  return allowedRoutes.some((route) => route.method === method && route.pattern.test(path));
}

function jsonResponse(payload: Record<string, string>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
