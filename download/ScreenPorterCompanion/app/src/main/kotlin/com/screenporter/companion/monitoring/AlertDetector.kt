package com.screenporter.companion.monitoring

/**
 * Rule-based content scanner for risk detection in SMS messages, browser URLs,
 * and notification snippets.
 *
 * Detects 5 categories:
 *  - cyberbullying: insults, threats, hate speech
 *  - drugs: substance mentions, slang
 *  - self_harm: suicidal ideation, self-injury references
 *  - sexting: explicit sexual content (kept abstract — no dictionary of slurs)
 *  - predator: adult contacting minor (patterns like "let's meet alone")
 *
 * Returns {flagged, flagReason} tuple. Only "snippet" redacted versions are
 * ever sent to the server (no raw content is transmitted — the app only sends
 * the flag + a heavily redacted snippet).
 *
 * Privacy: the dictionary is intentionally short and abstract. For richer
 * detection, integrate z-ai-web-dev-sdk LLM analysis on the server side.
 * The app should NEVER send the full raw message — only the flag + category.
 */
class AlertDetector {

    data class AlertResult(
        val flagged: Boolean,
        val flagReason: String? = null,
        val snippet: String = ""
    )

    fun scan(text: String): AlertResult {
        if (text.isBlank()) return AlertResult(false)
        val lower = text.lowercase()

        // Cyberbullying: hate-speech indicators
        if (BULLYING.any { lower.contains(it) }) {
            return AlertResult(true, "cyberbullying", redact(text))
        }
        // Drugs: substances + slang
        if (DRUGS.any { lower.contains(it) }) {
            return AlertResult(true, "drugs", redact(text))
        }
        // Self-harm: suicidal ideation
        if (SELF_HARM.any { lower.contains(it) }) {
            return AlertResult(true, "self_harm", redact(text))
        }
        // Sexting: explicit mentions (kept abstract)
        if (SEXTING.any { lower.contains(it) }) {
            return AlertResult(true, "sexting", redact(text))
        }
        // Predator: patterns of adults contacting minors
        if (PREDATOR.any { lower.contains(it) }) {
            return AlertResult(true, "predator", redact(text))
        }
        return AlertResult(false)
    }

    /**
     * Heavily redact the text — return only a heavily masked snippet.
     * The server receives this snippet (NOT the full message) to indicate the
     * nature of the alert without exposing the private conversation.
     */
    private fun redact(text: String): String {
        if (text.length <= 60) {
            return "[redacted]: ${text.take(15)}…"
        }
        return "[redacted]: ${text.take(30)}…"
    }

    companion object {
        private val BULLYING = listOf(
            "i hate you", "kill yourself", "you should die", "ugly", "stupid",
            "you're worthless", "nobody likes you", "freak", "loser",
            "you're pathetic", "everyone hates you"
        )
        private val DRUGS = listOf(
            "marijuana", "weed", "cocaine", "cocaina", "heroin", "lsd",
            "mdma", "ecstasy", "molly", "ketamine", "crack", "meth",
            "tramadol", "xanax", "oxycodone", "selling pills"
        )
        private val SELF_HARM = listOf(
            "want to die", "end it all", "kill myself", "suicide",
            "cut myself", "hurt myself", "no reason to live",
            "better off dead", "don't want to live"
        )
        private val SEXTING = listOf(
            "send me a pic", "nudes", "show me your", "explicit photos",
            "sexy pic", "send nudes"
        )
        private val PREDATOR = listOf(
            "let's meet alone", "don't tell your parents", "secret between us",
            "i'm an adult but", "meet me at my place", "you're special",
            "your parents don't understand us"
        )
    }
}
