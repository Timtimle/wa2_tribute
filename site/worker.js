function resolveByteRange(header, totalBytes) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, totalBytes - suffixLength),
      end: totalBytes - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalBytes - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= totalBytes
    || requestedEnd < start
  ) return null;

  return { start, end: Math.min(requestedEnd, totalBytes - 1) };
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    const isAudioRoute = /^\/audio\/[^/]+\.mp3$/i.test(url.pathname);
    let assetRequest = request;

    if (isAudioRoute) {
      const assetUrl = new URL(url);
      assetUrl.pathname = url.pathname.replace(/^\/audio\//i, "/_audio/");
      assetRequest = new Request(assetUrl, request);
    }

    let response = await environment.ASSETS.fetch(assetRequest);

    if (request.method === "GET" && response.status === 404 && !url.pathname.includes(".")) {
      response = await environment.ASSETS.fetch(new Request(new URL("/", url), request));
    }

    const headers = new Headers(response.headers);
    let body = response.body;
    let status = response.status;
    let statusText = response.statusText;

    if (isAudioRoute && response.status === 200) {
      headers.set("Accept-Ranges", "bytes");
      const rangeHeader = request.headers.get("Range");
      const totalBytes = Number(headers.get("Content-Length"));

      if (request.method === "GET" && rangeHeader && Number.isSafeInteger(totalBytes) && totalBytes > 0) {
        const byteRange = resolveByteRange(rangeHeader, totalBytes);
        if (!byteRange) {
          body = null;
          status = 416;
          statusText = "Range Not Satisfiable";
          headers.set("Content-Range", `bytes */${totalBytes}`);
          headers.set("Content-Length", "0");
        } else {
          const completeAudio = await response.arrayBuffer();
          body = completeAudio.slice(byteRange.start, byteRange.end + 1);
          status = 206;
          statusText = "Partial Content";
          headers.set("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${totalBytes}`);
          headers.set("Content-Length", String(byteRange.end - byteRange.start + 1));
        }
      }
    }

    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");

    return new Response(body, {
      status,
      statusText,
      headers,
    });
  },
};
