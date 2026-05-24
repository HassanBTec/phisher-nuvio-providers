"use strict";

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };

    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };

    var step = (x) =>
      x.done
        ? resolve(x.value)
        : Promise.resolve(x.value).then(fulfilled, rejected);

    step((generator = generator.apply(__this, __arguments)).next());
  });
};

const cheerio = require("cheerio-without-node-native");

const BASE_URL = "https://all-wish.me";

const TMDB_API_KEY =
  "1865f43a0549ca50d341dd9ab8b29f49";

const XML_HEADER = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
};

function btoa(str) {
  return Buffer.from(str, "binary").toString("base64");
}

// RC4 + transform + ROT13
function generateEpisodeVrf(episodeId) {
  const secretKey = "ysJhV6U27FVIjjuk";

  const encodedId = encodeURIComponent(episodeId);

  const keyCodes = secretKey
    .split("")
    .map((c) => c.charCodeAt(0));

  const dataCodes = encodedId
    .split("")
    .map((c) => c.charCodeAt(0));

  const n = Array.from(
    { length: 256 },
    (_, i) => i
  );

  let a = 0;

  for (let o = 0; o < 256; o++) {
    a =
      (a + n[o] + keyCodes[o % keyCodes.length]) %
      256;

    [n[o], n[a]] = [n[a], n[o]];
  }

  const out = [];

  let o = 0;
  a = 0;

  for (let r = 0; r < dataCodes.length; r++) {
    o = (o + 1) % 256;

    a = (a + n[o]) % 256;

    [n[o], n[a]] = [n[a], n[o]];

    const k = n[(n[o] + n[a]) % 256];

    out.push(dataCodes[r] ^ k);
  }

  const bytes = new Uint8Array(
    out.map((b) => b & 255)
  );

  const base64 = btoa(
    String.fromCharCode(...bytes)
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const transformed = [];

  for (let i = 0; i < base64.length; i++) {
    let s = base64.charCodeAt(i);

    const mod = i % 8;

    if (mod === 1) s += 3;
    else if (mod === 7) s += 5;
    else if (mod === 2) s -= 4;
    else if (mod === 4) s -= 2;
    else if (mod === 6) s += 4;
    else if (mod === 0) s -= 3;
    else if (mod === 3) s += 2;
    else if (mod === 5) s += 5;

    transformed.push(s & 255);
  }

  const bytes2 = new Uint8Array(transformed);

  const base2 = btoa(
    String.fromCharCode(...bytes2)
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return base2.replace(/[A-Za-z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;

    return String.fromCharCode(
      ((c.charCodeAt(0) - base + 13) % 26) + base
    );
  });
}

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  return __async(this, null, function* () {
    try {
      console.log(
        `[AllWish] Fetching ${mediaType} ${tmdbId}`
      );

      // TMDB
      const tmdbUrl =
        `https://api.themoviedb.org/3/${mediaType}/${tmdbId}` +
        `?api_key=${TMDB_API_KEY}`;

      const mediaInfo = yield (
        yield fetch(tmdbUrl)
      ).json();

      const title =
        mediaInfo.title || mediaInfo.name;

      if (!title) {
        console.log("[AllWish] No title found");
        return [];
      }

      console.log(`[AllWish] Title: ${title}`);

      // Search
      const searchUrl =
        `${BASE_URL}/filter?keyword=` +
        encodeURIComponent(title);

      const searchHtml = yield (
        yield fetch(searchUrl, {
          headers: XML_HEADER
        })
      ).text();

      const $ = cheerio.load(searchHtml);

      let animeUrl = null;

      $("div.item").each((_, item) => {
        const href = $(item)
          .find("div.name > a")
          .attr("href");

        if (href && !animeUrl) {
          animeUrl = href.startsWith("http")
            ? href
            : BASE_URL + href;

          animeUrl = animeUrl.replace(
            /\/+$/,
            ""
          );
        }
      });

      if (!animeUrl) {
        console.log(
          "[AllWish] No anime page found"
        );

        return [];
      }

      console.log(
        `[AllWish] Anime URL: ${animeUrl}`
      );

      // Anime page
      const animePage = yield (
        yield fetch(animeUrl, {
          headers: XML_HEADER
        })
      ).text();

      const $2 = cheerio.load(animePage);

      const dataId = $2(
        "main > div.container"
      ).attr("data-id");

      if (!dataId) {
        console.log("[AllWish] No data-id");

        return [];
      }

      console.log(
        `[AllWish] Data ID: ${dataId}`
      );

      // Episode list
      const vrf = generateEpisodeVrf(dataId);

      const epListUrl =
        `${BASE_URL}/ajax/episode/list/${dataId}` +
        `?vrf=${vrf}`;

      const epListRes = yield (
        yield fetch(epListUrl, {
          headers: XML_HEADER
        })
      ).json();

      if (
        !epListRes ||
        epListRes.status !== 200
      ) {
        console.log(
          "[AllWish] Episode list failed"
        );

        return [];
      }

      const $3 = cheerio.load(
        epListRes.result || ""
      );

      let episodeIds = null;

      const targetEp = episode || 1;

      $3("div.range > div > a").each(
        (_, el) => {
          const slug = $3(el).attr(
            "data-slug"
          );

          const epNum = parseInt(slug, 10);

          if (epNum === targetEp) {
            episodeIds = $3(el).attr(
              "data-ids"
            );
          }
        }
      );

      if (!episodeIds) {
        const firstEp = $3(
          "div.range > div > a"
        ).first();

        episodeIds =
          firstEp.attr("data-ids");
      }

      if (!episodeIds) {
        console.log(
          "[AllWish] No episode IDs"
        );

        return [];
      }

      console.log(
        `[AllWish] Episode IDs: ${episodeIds}`
      );

      // Server list
      const serverListUrl =
        `${BASE_URL}/ajax/server/list?servers=${episodeIds}`;

      const serverListRes = yield (
        yield fetch(serverListUrl, {
          headers: XML_HEADER
        })
      ).json();

      if (
        !serverListRes ||
        serverListRes.status !== 200
      ) {
        console.log(
          "[AllWish] Server list failed"
        );

        return [];
      }

      const $4 = cheerio.load(
        serverListRes.result || ""
      );

      const serverEls = [];

      $4("div.server-type").each(
        (_, section) => {
          $4(section)
            .find(
              "div.server-list > div.server"
            )
            .each((__, server) => {
              const dataLinkId = $4(
                server
              ).attr("data-link-id");

              const sectionType = $4(
                section
              ).attr("data-type");

              if (dataLinkId) {
                serverEls.push({
                  dataLinkId,
                  sectionType
                });
              }
            });
        }
      );

      console.log(
        `[AllWish] Servers found: ${serverEls.length}`
      );

      const streams = [];

      for (const {
        dataLinkId,
        sectionType
      } of serverEls.slice(0, 5)) {
        try {
          const apiUrl =
            `${BASE_URL}/ajax/server?get=${dataLinkId}`;

          const apiRes = yield (
            yield fetch(apiUrl, {
              headers: XML_HEADER
            })
          ).json();

          const realUrl =
            apiRes?.result?.url;

          if (realUrl) {

            // MegaPlay extractor
            if (
              realUrl.includes("megaplay") ||
              realUrl.includes("rapid-cloud")
            ) {

              try {

                // load embed page
                const embedHtml = yield (
                  yield fetch(realUrl, {
                    headers: {
                      "Referer":
                        "https://megaplay.buzz/",

                      "User-Agent":
                        "Mozilla/5.0"
                    }
                  })
                ).text();

                // extract data-id
                const dataIdMatch =
                  embedHtml.match(
                    /data-id="(\d+)"/
                  );

                const megaId =
                  dataIdMatch?.[1];

                if (!megaId) {
                  console.log(
                    "[MegaPlay] No data-id"
                  );

                  continue;
                }

                console.log(
                  `[MegaPlay] data-id: ${megaId}`
                );

                // source API
                const megaApi =
                  `https://megaplay.buzz/stream/getSources?id=${megaId}`;

                console.log(
                  `[MegaPlay] API: ${megaApi}`
                );

                const megaRes = yield (
                  yield fetch(megaApi, {
                    headers: {
                      "Referer":
                        realUrl,

                      "Origin":
                        "https://megaplay.buzz",

                      "X-Requested-With":
                        "XMLHttpRequest",

                      "User-Agent":
                        "Mozilla/5.0"
                    }
                  })
                ).json();

                const source =
                  megaRes?.sources?.file;

                if (source) {

                  streams.push({
                    name:
                      `AllWish - MegaPlay ` +
                      `${(
                        sectionType || "SUB"
                      ).toUpperCase()}`,

                    title:
                      `MegaPlay ` +
                      `${(
                        sectionType || "SUB"
                      ).toUpperCase()}`,

                    url: source,

                    quality: "1080p",

                    subtitles:
                      megaRes?.tracks?.map(
                        (track) => ({
                          lang:
                            track.label ||
                            "Unknown",

                          url: track.file
                        })
                      ) || [],

                    headers: {
                      "Referer":
                        "https://rapid-cloud.co/",

                      "Origin":
                        "https://rapid-cloud.co"
                    }
                  });

                  continue;
                }

              } catch (e) {
                console.log(
                  `[MegaPlay] ${e.message}`
                );
              }
            }

            // fallback
            streams.push({
              name:
                `AllWish - ` +
                `${(
                  sectionType || "SUB"
                ).toUpperCase()}`,

              title:
                `AllWish ` +
                `${(
                  sectionType || "SUB"
                ).toUpperCase()}`,

              url: realUrl,

              quality: "1080p"
            });
          }
        } catch (err) {
          console.log(
            `[AllWish] Server error: ${err.message}`
          );
        }
      }

      console.log(
        `[AllWish] Streams found: ${streams.length}`
      );

      return streams;
    } catch (e) {
      console.log(
        `[AllWish] Error: ${e.message}`
      );

      return [];
    }
  });
}

//Extractor MegaPlay
function extractMegaPlay(url) {
  return __async(this, null, function* () {
    try {
      const mainUrl = "https://megaplay.buzz";

      const mainHeaders = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",

        "Accept": "*/*",

        "Accept-Language":
          "en-US,en;q=0.5",

        "Origin":
          "https://rapid-cloud.co",

        "Referer":
          "https://rapid-cloud.co/"
      };

      const headers = {
        "Accept": "*/*",

        "X-Requested-With":
          "XMLHttpRequest",

        "Referer": mainUrl
      };

      let id = null;

      // extract ID from URL
      if (url.includes("/")) {
        id = url
          .split("/")
          .pop()
          .split("?")[0];
      }

      if (!id) {
        console.log(
          "[MegaPlay] Invalid ID"
        );

        return [];
      }

      const apiUrl =
        `${mainUrl}/embed-2/v2/e-1/getSources?id=${id}`;

      console.log(
        `[MegaPlay] API: ${apiUrl}`
      );

      const response = yield (
        yield fetch(apiUrl, {
          headers
        })
      ).json();

      if (!response)
        return [];

      const source =
        response.sources &&
          response.sources.length
          ? response.sources[0]
          : null;

      if (!source || !source.file) {
        console.log(
          "[MegaPlay] No source"
        );

        return [];
      }

      const streams = [];

      streams.push({
        name: "MegaPlay",
        title: "MegaPlay HLS",
        url: source.file,
        quality: "1080p",

        headers: mainHeaders,

        subtitles:
          response.tracks
            ?.filter(
              (t) =>
                t.kind === "captions" ||
                t.kind === "subtitles"
            )
            .map((t) => ({
              lang:
                t.label || "Unknown",

              url: t.file
            })) || []
      });

      return streams;

    } catch (e) {
      console.log(
        `[MegaPlay] ${e.message}`
      );

      return [];
    }
  });
}

module.exports = { getStreams };