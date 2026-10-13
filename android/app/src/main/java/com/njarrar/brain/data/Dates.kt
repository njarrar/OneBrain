package com.njarrar.brain.data

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Locale

object Dates {
    private val zone: ZoneId get() = ZoneId.systemDefault()

    /** ISO times from the server, with or without a zone. */
    fun parse(s: String?): Instant? {
        if (s.isNullOrBlank()) return null
        runCatching { return OffsetDateTime.parse(s).toInstant() }
        runCatching { return LocalDateTime.parse(s.replace(' ', 'T')).toInstant(ZoneOffset.UTC) }
        runCatching { return LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant() }
        return null
    }

    fun iso(i: Instant): String = DateTimeFormatter.ISO_INSTANT.format(i)

    private fun fmt(pattern: String) = DateTimeFormatter.ofPattern(pattern, Locale.getDefault())

    private fun daysAgo(i: Instant): Long =
        ChronoUnit.DAYS.between(i.atZone(zone).toLocalDate(), LocalDate.now(zone))

    /** "18 Sep 2026". */
    fun short(i: Instant?): String = i?.atZone(zone)?.format(fmt("d MMM yyyy")) ?: ""

    /** Time today, the weekday this week, else the date: "9:14", "Wed", "Sep 18". */
    fun row(i: Instant?): String {
        if (i == null) return ""
        val t = i.atZone(zone)
        val days = daysAgo(i)
        return when {
            days == 0L -> t.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
            days in 1..6 -> t.format(fmt("EEE"))
            t.year == LocalDate.now(zone).year -> t.format(fmt("MMM d"))
            else -> t.format(fmt("MMM d, yyyy"))
        }
    }

    /** The day group a row sits in: Today, Yesterday, Earlier this week, then month and year. */
    fun group(i: Instant?): String {
        if (i == null) return "Earlier"
        val days = daysAgo(i)
        return when {
            days <= 0L -> "Today"
            days == 1L -> "Yesterday"
            days < 7 -> "Earlier this week"
            else -> i.atZone(zone).format(fmt("MMMM yyyy"))
        }
    }

    /** "28 Sep 2026, 21:24", in this phone's time zone. */
    fun stamp(s: String?): String? = parse(s)?.atZone(zone)?.format(fmt("d MMM yyyy, HH:mm"))

    /** "Wednesday, October 14". */
    fun longDay(i: Instant): String = i.atZone(zone).format(fmt("EEEE, MMMM d"))

    /** 9 in the morning, local time, on the given day. */
    fun morning(day: LocalDate): Instant = day.atTime(9, 0).atZone(zone).toInstant()

    fun inDays(n: Long): Instant = morning(LocalDate.now(zone).plusDays(n))

    /** Next Saturday morning. */
    fun weekend(): Instant = morning(LocalDate.now(zone).with(TemporalAdjusters.next(DayOfWeek.SATURDAY)))

    /** A date picker's day (UTC midnight millis) as a local date. */
    fun pickedDay(utcMillis: Long): LocalDate = Instant.ofEpochMilli(utcMillis).atZone(ZoneOffset.UTC).toLocalDate()

    /** Today at UTC midnight, for the date picker. */
    fun todayUtcMillis(): Long = LocalDate.now(zone).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
}
