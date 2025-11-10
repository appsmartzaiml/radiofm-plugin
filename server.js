import express from "express";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const RADIOFM_API_BASE = "https://devappradiofm.radiofm.co/rfm/api";
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve .well-known (ai-plugin.json & openapi.yaml)
app.use(
    "/.well-known",
    express.static(path.join(__dirname, ".well-known"))
);

// ---------- Helpers (JS versions of your formatters) ----------

/**
 * Map raw station from RadioFM API to plugin station schema
 */
function mapRadioStation(station) {
    return {
        id: station.st_id,
        name: station.st_name,
        logo: station.st_logo,
        website: station.st_weburl,
        shortUrl: station.st_shorturl,
        genre: station.st_genre,
        languageCode: station.st_lang,
        language: station.language,
        frequency: station.st_bc_freq === "~" ? null : station.st_bc_freq,
        city: station.st_city,
        state: station.st_state,
        countryName: station.country_name_rs,
        countryCode: station.st_country,
        playCount: parseInt(station.st_play_cnt || "0", 10),
        favoriteCount: parseInt(station.st_fav_cnt || "0", 10),
        streamUrl: station.stream_link,
        streamType: station.stream_type,
        streamBitrate: station.stream_bitrate,
        deeplink: station.deeplink,
        listenUrl: `https://appradiofm.com/radioplay/${station.st_shorturl}`
    };
}

/**
 * Map raw podcast from RadioFM API to plugin podcast schema
 */
function mapPodcast(podcast) {
    return {
        id: podcast.p_id,
        name: podcast.p_name,
        description: podcast.p_desc,
        language: podcast.p_lang,
        image: podcast.p_image,
        email: podcast.p_email,
        category: podcast.cat_name,
        totalStream: parseInt(podcast.total_stream || "0", 10),
        deeplink: podcast.deeplink,
        countryCode: podcast.cc_code
    };
}

// ---------- Routes ----------

// Health check
app.get("/", (_req, res) => {
    res.json({
        status: "RadioFM ChatGPT Plugin server is running",
        version: "1.0.0",
        docs: "/.well-known/openapi.yaml"
    });
});

/**
 * /search endpoint
 * - ChatGPT calls this with ?query=...
 * - We proxy to RADIOFM new_combo_search.php and normalize result.
 */
app.get("/search", async (req, res) => {
    const query = (req.query.query || "").trim();

    if (!query) {
        return res.status(400).json({
            error: "Missing required query parameter: query"
        });
    }

    try {
        const response = await axios.get(
            `${RADIOFM_API_BASE}/new_combo_search.php`,
            {
                params: { srch: query },
                timeout: 15000
            }
        );

        const apiData = response.data;

        if (!apiData || !apiData.data) {
            return res.status(502).json({
                error: "Unexpected response from RadioFM API"
            });
        }

        if (apiData.data.ErrorCode !== 0) {
            return res.status(502).json({
                error: apiData.data.ErrorMessage || "RadioFM API error"
            });
        }

        const buckets = apiData.data.Data || [];
        const radioBucket = buckets.find((b) => b.type === "radio");
        const podcastBucket = buckets.find((b) => b.type === "podcast");

        const stations =
            radioBucket && Array.isArray(radioBucket.data)
                ? radioBucket.data.map(mapRadioStation)
                : [];

        const podcasts =
            podcastBucket && Array.isArray(podcastBucket.data)
                ? podcastBucket.data.map(mapPodcast)
                : [];

        return res.json({
            query,
            totalStations: stations.length,
            totalPodcasts: podcasts.length,
            stations,
            podcasts
        });
    } catch (err) {
        console.error("Search error:", err.message);
        return res.status(500).json({
            error: "Internal server error while searching RadioFM"
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`✅ RadioFM ChatGPT Plugin running on http://localhost:${port}`);
    console.log(`📡 Manifest: http://localhost:${port}/.well-known/ai-plugin.json`);
});
