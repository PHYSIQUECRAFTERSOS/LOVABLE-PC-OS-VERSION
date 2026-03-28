const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractOGTags(html: string) {
  const get = (property: string): string | null => {
    // Try og: prefix first, then twitter:, then generic meta name
    for (const prefix of [`og:${property}`, `twitter:${property}`, property]) {
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${prefix}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prefix}["']`, "i"),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return match[1];
      }
    }
    return null;
  };

  // Fallback title from <title> tag
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  return {
    title: get("title") || titleTag?.[1]?.trim() || null,
    description: get("description") || null,
    image: get("image") || null,
    site_name: get("site_name") || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    console.log("Fetching link preview for:", targetUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `HTTP ${response.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return new Response(
        JSON.stringify({ success: false, error: "Not an HTML page" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read only first 50KB to limit memory
    const reader = response.body?.getReader();
    let htmlChunks = "";
    let totalBytes = 0;
    const MAX_BYTES = 50_000;

    if (reader) {
      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        htmlChunks += new TextDecoder().decode(value);
        totalBytes += value.length;
      }
      reader.cancel();
    }

    const og = extractOGTags(htmlChunks);

    if (!og.title && !og.description && !og.image) {
      return new Response(
        JSON.stringify({ success: false, error: "No OG metadata found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve relative image URLs
    if (og.image && !og.image.startsWith("http")) {
      try {
        og.image = new URL(og.image, targetUrl).href;
      } catch {
        og.image = null;
      }
    }

    const preview = {
      url: targetUrl,
      title: og.title,
      description: og.description,
      image: og.image,
      site_name: og.site_name,
    };

    console.log("Preview fetched:", preview.title);

    return new Response(
      JSON.stringify({ success: true, preview }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching link preview:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
