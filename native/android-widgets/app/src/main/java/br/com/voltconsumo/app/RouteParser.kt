package br.com.voltconsumo.app

import java.net.URI

internal object RouteParser {
    fun fromValue(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val uri = runCatching { URI(value) }.getOrNull() ?: return null
        if (uri.scheme != "volt") return null
        val pieces = buildList {
            uri.host?.takeIf { it.isNotBlank() }?.let(::add)
            uri.path.orEmpty().split('/').filter { it.isNotBlank() }.forEach(::add)
        }
        return if (pieces.isEmpty()) "home" else pieces.joinToString("/").lowercase()
    }
}
