import type { Instrumentation } from "next";

// One structured line per server error (pages, route handlers, server
// actions), with the digest users see on the error page so a report can be
// matched to a log. Ship logs to wherever you watch them: a Vercel log drain,
// or `docker logs` into your collector. The message is cut short and the
// request body never logged — errors can carry user text.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const e = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      digest: e.digest ?? null,
      name: e.name,
      message: e.message?.slice(0, 200),
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
