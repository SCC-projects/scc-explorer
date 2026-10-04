# Calendars

How the Timeline places and labels dates. All of it lives in
`timeline/app.js`, in the sections *calendar conversion*, *papal calendar*
and *computus*.

## One physical axis, several ways to read it

vis-timeline positions items with JavaScript `Date` objects, which follow
the **proleptic Gregorian** calendar: Gregorian rules extended backwards
before 1582. The sources, however, record dates before the reform in the
**Julian** calendar. The application keeps the two apart:

- **Positions** are physical instants. At load time every pre-reform source
  date is converted from Julian to Gregorian, so an item sits where the day
  really fell. Positions never change afterwards.
- **Labels** are a display choice. The *Julian / Gregorian* switch decides
  whether pre-reform dates on the axis and in the cards are shown in Julian
  reckoning (as in the source) or in proleptic Gregorian.

All conversions go through the **Julian Day Number** (JDN), a continuous
count of days that both calendars map onto.

## Which calendar a source date belongs to

The reform is taken as in Rome: Thursday 4 October 1582 (Julian) was
followed by Friday 15 October 1582 (Gregorian); JDN 2299161.

```
date read as Gregorian ≥ 15 October 1582   →  Gregorian
otherwise                                   →  Julian
```

So `1582-10-04` is Julian and `1582-10-15` Gregorian — consecutive days.
Dates in the ten skipped days do not exist in Roman sources and fall through
to the Julian branch.

**Year start.** A year is taken to begin on 1 January. Regional styles
(Annunciation, Easter, Nativity) must be normalised in the data; the display
layer does not know where a source comes from.

**Outside Rome.** Many territories adopted the Gregorian calendar later
(Protestant German states in 1700, Britain in 1752, Russia in 1918). The rule
above is Rome's. For a dataset that mixes jurisdictions, normalise the dates
per source before import, or extend `sourceToInstant` with a per-row
calendar column.

## Labels

Grid lines sit on Gregorian month and year boundaries. In Julian mode, a
Julian label at such an instant would still name the previous month or year
— the two calendars differ by ten days in the sixteenth century — so for
month and year scales the Julian value is sampled sixteen days into the
interval: past the offset, well short of the interval length.

In cards, a pre-reform date shows:

- Julian mode: the Julian date with a *Julian* badge;
- Gregorian mode: the proleptic Gregorian date with a *prol. Greg.* badge,
  and the source date underneath.

## Papal calendar

Regnal years (*anno pontificatus*) are counted from the **start** of each
range of the reference chronology — in the project's convention, the
election of the pope (as in the *Annuario Pontificio*). Year I begins on that
day; year II on its first anniversary, and so on.

Anniversaries across the reform are taken on the same nominal day and month
in the calendar of each era, following curial practice: a pope elected on
10 May 1572 (Julian) begins his year XI on 10 May 1582 (Julian) and his year
XII on 10 May 1583 (Gregorian).

Vacancies are reference ranges flagged by `vacancyClass` in `config.js` (or
labelled *sede vacante* / *sedes vacans*). When both a reign and a vacancy
cover a day — overlapping data — the reign wins.

On the axis, the regnal year joins each year label when there is room
(about 70 px per year column; the pope's name needs about 140 px and is
added where a reign begins). Wider windows show civil years only, and the
sticky label at the edge carries the reign.

## Easter

One date per year of the data range:

- **to 1582** — the **Julian computus** (the Alexandrian rule as computed in
  the Julian calendar), giving a Julian date;
- **from 1583** — the **Gregorian computus**, using the anonymous algorithm
  published by Meeus, also known as Jones–Butcher.

Both results are converted through the JDN onto the same physical axis.
Easter 1582 fell on 15 April (Julian), before the reform; Easter 1583 on
10 April (Gregorian).

The Easter lines are background items, which vis-timeline draws underneath
everything else, so the pointer never reaches them. The hover tooltip
therefore works the other way round: on every mouse move, the instant under
the cursor is compared with the Easter dates of that year and its
neighbours, within a tolerance of about six pixels at the current zoom.
