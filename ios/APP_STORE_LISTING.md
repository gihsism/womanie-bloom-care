# Womanie — App Store submission kit

Everything App Store Connect asks for, ready to paste. Review it before
submitting: wording you change here doesn't affect the app.

## App information

| Field | Value |
|---|---|
| Name | Womanie |
| Subtitle (30 chars) | Women's health, every stage |
| Bundle ID | info.womanie.app |
| SKU | womanie-ios-1 |
| Primary category | Health & Fitness |
| Secondary category | Medical |
| Privacy policy URL | https://womanie.info/privacy |
| Support URL | https://womanie.info/about |
| Marketing URL | https://womanie.info |
| Copyright | 2026 Womanie |
| Price | Free |

## Description (4,000 chars max)

Womanie is a women's health companion that adapts to where you are: periods
and cycle tracking, trying to conceive, IVF, pregnancy, postpartum,
contraception and menopause.

UNDERSTAND YOUR LAB RESULTS
Upload a blood test or medical report as a PDF or photo. Womanie reads every
value, explains what it means in plain language, flags results outside the
reference range and tracks how each marker changes over time.

CYCLE AND FERTILITY TRACKING
Log your period, symptoms, mood, discharge, basal temperature and LH tests.
Womanie predicts your next period and fertile window, learns your personal
pattern, and shows how accurate past predictions were.

A HEALTH ASSISTANT THAT KNOWS YOUR HISTORY
Ask questions about your own records and get answers grounded in your
uploaded results. Responses are informational and never replace your doctor.

SHARE WITH YOUR DOCTOR — ON YOUR TERMS
Connect a doctor with a one-time code. Nothing is shared until you approve
the request, and you can revoke access at any time.

YOUR DATA IS YOURS
Download everything Womanie holds about you, or delete your account and all
your data permanently, from Settings.

Womanie provides general health information and is not a medical device. It
does not diagnose, treat or prevent any condition, and it is not a method of
contraception. Always consult a qualified healthcare professional about your
health. In an emergency, call your local emergency number.

## Keywords (100 chars, comma-separated, no spaces)

period,cycle,ovulation,fertility,pregnancy,menopause,IVF,lab results,blood test,women's health

## Promotional text (170 chars, editable anytime)

Upload a blood test and understand every value in plain language — plus cycle,
fertility, pregnancy and menopause tracking in one private place.

## Age rating questionnaire

- Medical/Treatment Information: **Infrequent/Mild**
- Everything else: None
- Unrestricted web access: **No** (the app only loads womanie.info)
- Expected rating: 12+

## App Privacy ("nutrition label")

Data used to track you across other companies' apps/sites: **None** (no ads,
no third-party analytics SDKs, no tracking).

Data collected, all **linked to the user**, purpose **App Functionality**:

| Category | Type | Why |
|---|---|---|
| Health & Fitness | Health | Cycle logs, symptoms, lab values, pregnancy/IVF data |
| Contact Info | Email address, Name | Account and sign-in |
| User Content | Photos or videos, Other user content | Uploaded documents, chat messages |
| Identifiers | User ID | Account |
| Diagnostics | Crash data | Error monitoring (Sentry) |

Third parties that process data for the app (mention if asked): Neon
(database), Vercel (hosting, file storage), Anthropic (AI analysis; no
training on API data), Sentry (error reports).

## Export compliance

Uses only standard HTTPS encryption → exempt. Already declared in Info.plist
(`ITSAppUsesNonExemptEncryption = NO`), so App Store Connect won't ask.

## App Review information

- Sign-in required: **Yes**
- Demo account: use the E2E test patient (`E2E_EMAIL` / `E2E_PASSWORD` in
  `.env.local`). Make sure it has a sample document and a few days of logs.
- Contact: Alena, gihsism@gmail.com

Notes for the reviewer (paste):

> Womanie is a women's health tracker. Sign in with the demo account above.
> Key flows: Dashboard → log today's cycle data; Health Records → open the
> sample lab report to see the extracted values and explanations; AI
> Assistant → ask "What do my latest results mean?". Account deletion:
> Settings → Delete my account. Data export: Settings → Download my data.
> The AI assistant gives general information based on the user's own records
> and shows a disclaimer that it is not medical advice. Womanie is not a
> medical device and makes no diagnostic claims.

## Screenshots needed

Apple requires 6.9" iPhone screenshots (1320 × 2868 or 1290 × 2796), 3–10 of
them. Suggested set, taken in the demo account:
1. Dashboard with cycle prediction
2. A lab report with extracted values and flags
3. A marker trend chart
4. AI assistant answering a question about results
5. Doctor sharing / approval screen
6. Privacy & Security page

## Known review risks

1. **Guideline 4.2 (minimum functionality):** the app loads womanie.info in a
   web view. Apple sometimes rejects "repackaged websites". Mitigations: the
   site is a full app (accounts, uploads, tracking), not a brochure. If
   rejected, add a native feature such as push reminders for period/pill
   logging.
2. **Guideline 1.4.1 (medical apps):** DONE 2026-11-09 — renamed to "AI Health Assistant". The old name "AI Doctor" could read
   as a claim to provide a doctor. Consider "AI Health Assistant" in the app
   before submitting.
3. **Doctor directory:** reviewers may ask how doctors are verified. Answer:
   doctors apply, and an admin approves each one manually before they
   appear.
