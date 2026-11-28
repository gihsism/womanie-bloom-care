// Title, description and canonical link for each public (signed-out)
// page, so a search result or a shared link shows that page and not the
// home page's text. No new claims: every description is made of text the
// page already shows (its headline and intro), and a test checks each
// piece against the page's source file.

export const SITE_ORIGIN = 'https://womanie.info';

/** Same as <title> / description in index.html (the home page). */
export const DEFAULT_TITLE = 'Womanie - Cycle, pregnancy, menopause and your lab results';
export const DEFAULT_DESCRIPTION =
  'Track your cycle, pregnancy, IVF or menopause, and upload a lab report to see each value explained in plain language.';
export const DEFAULT_OG_DESCRIPTION =
  'Cycle, pregnancy, IVF and menopause tracking, with your lab reports explained in plain language.';

export interface PublicPageMeta {
  /** Tab title before " — Womanie"; null keeps the home page's full title. */
  title: string | null;
  /** Pieces of the page's own text, joined with a space. */
  parts: string[];
  /** Where the pieces come from (checked by the test). */
  source: string;
}

export const PUBLIC_PAGE_META = {
  '/': { title: null, parts: [DEFAULT_DESCRIPTION], source: 'index.html' },
  '/product': {
    title: 'Product',
    parts: ['Your cycle, your body, your records.', 'Womanie tracks the stage you are in, explains your lab reports, and helps you prepare for doctor visits.'],
    source: 'src/pages/Product.tsx',
  },
  '/for-patients': {
    title: 'For Patients',
    parts: ['Upload a lab report and see every test explained in plain language, next to your earlier results and in the context of your stage.'],
    source: 'src/pages/ForPatients.tsx',
  },
  '/for-doctors': {
    title: 'For Doctors',
    parts: ['Patients upload their lab reports and track their cycle or pregnancy in Womanie. With her permission, you see it all in one place.'],
    source: 'src/pages/ForDoctors.tsx',
  },
  '/about': {
    title: 'About',
    parts: ['Womanie started with a folder of lab results nobody explained. We are building the app we wanted then: one place for your records, your stage and your questions.'],
    source: 'src/pages/About.tsx',
  },
  '/pricing': {
    title: 'Pricing',
    parts: ["Choose the plan that's right for you. Always know what you'll pay."],
    source: 'src/pages/Pricing.tsx',
  },
  '/blog': {
    title: 'Blog',
    parts: ["Women's Health Blog.", 'Plain explanations of tests, symptoms and treatments, with the sources we used.'],
    source: 'src/pages/Blog.tsx',
  },
  '/library': {
    title: 'Research library',
    parts: ["Clinical guidelines and research reviews about women's health, summarised in plain English."],
    source: 'src/pages/ResearchLibrary.tsx',
  },
  '/privacy': {
    title: 'Privacy & Security',
    parts: ["Your data is yours.", "Here's exactly where your data lives, who can see it, and what controls you have."],
    source: 'src/pages/dashboard/Privacy.tsx',
  },
  '/install': {
    title: 'Install App',
    parts: ['Install Womanie.', 'Add Womanie to your home screen for quick access and an app-like experience.'],
    source: 'src/pages/Install.tsx',
  },
  '/community': {
    title: 'Community',
    parts: ['Womanie Community will be a moderated space to compare notes with women who are going through the same thing: trying, pregnant, in IVF or in menopause.'],
    source: 'src/pages/Community.tsx',
  },
  '/find-doctor': {
    title: 'Find a Doctor',
    parts: ['Find a Doctor.', 'Book a consultation with verified healthcare professionals.'],
    source: 'src/pages/FindDoctor.tsx',
  },
  '/auth/select-type': {
    title: 'Get Started',
    parts: ['Welcome to Womanie.', 'How will you use the app?'],
    source: 'src/pages/auth/SelectUserType.tsx',
  },
  '/auth/signup': {
    title: 'Sign Up',
    parts: ['Create your account.', 'Free. Takes about a minute.'],
    source: 'src/pages/auth/PatientSignUp.tsx',
  },
  '/auth/login': {
    title: 'Log In',
    parts: ['Log in to Womanie.', 'Your records and tracking are where you left them.'],
    source: 'src/pages/auth/PatientLogIn.tsx',
  },
  '/auth/doctor-login': {
    title: 'Doctor Login',
    parts: ['Doctor log in.', "See your patients and today's visits."],
    source: 'src/pages/auth/DoctorLogIn.tsx',
  },
  '/auth/doctor-signup': {
    title: 'Doctor Sign Up',
    parts: ['Register as a doctor.'],
    source: 'src/pages/auth/DoctorSignUp.tsx',
  },
} satisfies Record<string, PublicPageMeta>;

export type PublicPath = keyof typeof PUBLIC_PAGE_META;

export const describePage = (path: PublicPath) => PUBLIC_PAGE_META[path].parts.join(' ');
export const canonicalUrl = (path: PublicPath) => `${SITE_ORIGIN}${path === '/' ? '/' : path}`;
