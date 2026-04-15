package com.thumbify

import expo.modules.kotlin.Package

class ThumbifyPackage : Package {
    override fun createModules() = listOf(::ThumbifyModule)
}
