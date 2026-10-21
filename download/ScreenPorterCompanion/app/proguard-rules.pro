# Add project specific ProGuard rules here.
-keepattributes Signature
-keepattributes *Annotation*

-keep class com.screenporter.companion.** { *; }
-keepclassmembers class * {
    @com.squareup.moshi.JsonClass <methods>;
}
