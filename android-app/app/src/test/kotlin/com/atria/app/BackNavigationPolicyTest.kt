package com.atria.app

import org.junit.Assert.assertEquals
import org.junit.Test

class BackNavigationPolicyTest {
    @Test
    fun webLayerConsumptionWinsOverHistory() {
        assertEquals(
            AtriaBackAction.CONSUMED,
            resolveAtriaBackAction("consumed", canGoBack = true),
        )
    }

    @Test
    fun historyRunsOnlyAfterWebLayerDeclines() {
        assertEquals(
            AtriaBackAction.NAVIGATE_HISTORY,
            resolveAtriaBackAction("unhandled", canGoBack = true),
        )
        assertEquals(
            AtriaBackAction.NAVIGATE_HISTORY,
            resolveAtriaBackAction("noop", canGoBack = true),
        )
    }

    @Test
    fun exitConfirmationIsLastFallback() {
        assertEquals(
            AtriaBackAction.CONFIRM_EXIT,
            resolveAtriaBackAction("unhandled", canGoBack = false),
        )
    }
}
