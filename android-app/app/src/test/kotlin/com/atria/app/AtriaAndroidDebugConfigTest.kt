// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

package com.atria.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AtriaAndroidDebugConfigTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("atria_android_debug_config", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun is_enabled_default_false() {
        assertFalse(AtriaAndroidDebugConfig.isEnabled(context))
    }

    @Test
    fun set_enabled_true_then_read_back_true() {
        AtriaAndroidDebugConfig.setEnabled(context, true)
        assertTrue(AtriaAndroidDebugConfig.isEnabled(context))
    }

    @Test
    fun set_enabled_false_then_read_back_false() {
        AtriaAndroidDebugConfig.setEnabled(context, true)
        AtriaAndroidDebugConfig.setEnabled(context, false)
        assertFalse(AtriaAndroidDebugConfig.isEnabled(context))
    }
}
