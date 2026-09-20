package com.atria.app

internal enum class AtriaBackAction {
    CONSUMED,
    NAVIGATE_HISTORY,
    CONFIRM_EXIT,
}

/**
 * Web UI and immersive presentation get first refusal on Android Back.
 * WebView history is only consulted after the page explicitly reports that
 * it did not consume the press.
 */
internal fun resolveAtriaBackAction(webResult: String?, canGoBack: Boolean): AtriaBackAction {
    if (webResult.equals("consumed", ignoreCase = true)) {
        return AtriaBackAction.CONSUMED
    }
    if (canGoBack) {
        return AtriaBackAction.NAVIGATE_HISTORY
    }
    return AtriaBackAction.CONFIRM_EXIT
}
