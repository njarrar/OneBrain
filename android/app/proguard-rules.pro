# Keep the app's own classes whole: JSON models and navigation routes are read by name.
-keep class com.njarrar.brain.** { *; }
-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod

# Classes that libraries mention but Android doesn't have (OkHttp's TLS options, Tink's extras).
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn com.google.api.client.**
-dontwarn org.joda.time.**
