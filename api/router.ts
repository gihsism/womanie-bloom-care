import type { VercelRequest, VercelResponse } from '@vercel/node';
import adminDocs from './_routes/admin/docs.js';
import adminDoctors from './_routes/admin/doctors.js';
import adminInvites from './_routes/admin/invites.js';
import appointmentsBook from './_routes/appointments/book.js';
import appointmentsReschedule from './_routes/appointments/reschedule.js';
import authCallback from './_routes/auth/callback.js';
import authChangePassword from './_routes/auth/change-password.js';
import authDoctorInvite from './_routes/auth/doctor-invite.js';
import authDoctorSignup from './_routes/auth/doctor-signup.js';
import authGoogle from './_routes/auth/google.js';
import authLogin from './_routes/auth/login.js';
import authLogout from './_routes/auth/logout.js';
import authMe from './_routes/auth/me.js';
import authSignup from './_routes/auth/signup.js';
import babyScalePhoto from './_routes/baby/scale-photo.js';
import chatConversation from './_routes/chat/conversation.js';
import chatFeedback from './_routes/chat/feedback.js';
import chatMessages from './_routes/chat/messages.js';
import connectionsApproved from './_routes/connections/approved.js';
import connectionsPending from './_routes/connections/pending.js';
import connectionsRedeemCode from './_routes/connections/redeem-code.js';
import connectionsRespond from './_routes/connections/respond.js';
import db from './_routes/db.js';
import maintenance from './_routes/maintenance.js';
import docsDelete from './_routes/docs/delete.js';
import docsFile from './_routes/docs/file.js';
import docsFromDoctor from './_routes/docs/from-doctor.js';
import docsPendingRetries from './_routes/docs/pending-retries.js';
import doctorsAvailability from './_routes/doctors/availability.js';
import doctorsConnections from './_routes/doctors/connections.js';
import doctorsDay from './_routes/doctors/day.js';
import doctorsList from './_routes/doctors/list.js';
import doctorsPatient from './_routes/doctors/patient.js';
import doctorsPatientTrends from './_routes/doctors/patient-trends.js';
import doctorsProfile from './_routes/doctors/profile.js';
import doctorsSchedule from './_routes/doctors/schedule.js';
import meAppointments from './_routes/me/appointments.js';
import meChartAccess from './_routes/me/chart-access.js';
import meConsents from './_routes/me/consents.js';
import meDeleteAccount from './_routes/me/delete-account.js';
import meDoctorNotes from './_routes/me/doctor-notes.js';
import meExport from './_routes/me/export.js';
import meNormalizeTitles from './_routes/me/normalize-titles.js';
import newsletterSubscribe from './_routes/newsletter/subscribe.js';
import predictOvulation from './_routes/predict-ovulation.js';
import pushConfig from './_routes/push/config.js';
import pushSendDue from './_routes/push/send-due.js';
import pushSubscription from './_routes/push/subscription.js';
import pushTest from './_routes/push/test.js';
import researchLibrary from './_routes/research/library.js';
import { blockIfMaintenance } from './_lib/maintenance.js';
import { ROUTE_KEY } from './_lib/sentry.js';

// Single entry point for the API routes that need no per-function config.
//
// Vercel's Hobby plan caps a deployment at 12 serverless functions, and
// every file under api/ (except _-prefixed paths) becomes one. The
// handlers live in api/_routes/<same path>.ts; vercel.json rewrites any
// /api/<path> that isn't a real file to /api/router?__route=<path>, and
// this dispatches it, so URLs are unchanged. Routes that need their own
// config (maxDuration, bodyParser) stay as standalone files, which Vercel
// matches before the rewrite:
//   upload, analyze-document, ai-doctor-chat, summary/panel, summary/generate

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

export const ROUTES: Record<string, Handler> = {
  'admin/docs': adminDocs,
  'admin/doctors': adminDoctors,
  'admin/invites': adminInvites,
  'appointments/book': appointmentsBook,
  'appointments/reschedule': appointmentsReschedule,
  'auth/callback': authCallback,
  'auth/change-password': authChangePassword,
  'auth/doctor-invite': authDoctorInvite,
  'auth/doctor-signup': authDoctorSignup,
  'auth/google': authGoogle,
  'auth/login': authLogin,
  'auth/logout': authLogout,
  'auth/me': authMe,
  'auth/signup': authSignup,
  'baby/scale-photo': babyScalePhoto,
  'chat/conversation': chatConversation,
  'chat/feedback': chatFeedback,
  'chat/messages': chatMessages,
  'connections/approved': connectionsApproved,
  'connections/pending': connectionsPending,
  'connections/redeem-code': connectionsRedeemCode,
  'connections/respond': connectionsRespond,
  'db': db,
  'maintenance': maintenance,
  'docs/delete': docsDelete,
  'docs/file': docsFile,
  'docs/from-doctor': docsFromDoctor,
  'docs/pending-retries': docsPendingRetries,
  'doctors/availability': doctorsAvailability,
  'doctors/connections': doctorsConnections,
  'doctors/day': doctorsDay,
  'doctors/list': doctorsList,
  'doctors/patient': doctorsPatient,
  'doctors/patient-trends': doctorsPatientTrends,
  'doctors/profile': doctorsProfile,
  'doctors/schedule': doctorsSchedule,
  'me/appointments': meAppointments,
  'me/chart-access': meChartAccess,
  'me/consents': meConsents,
  'me/delete-account': meDeleteAccount,
  'me/doctor-notes': meDoctorNotes,
  'me/export': meExport,
  'me/normalize-titles': meNormalizeTitles,
  'newsletter/subscribe': newsletterSubscribe,
  'predict-ovulation': predictOvulation,
  'push/config': pushConfig,
  'push/send-due': pushSendDue,
  'push/subscription': pushSubscription,
  'push/test': pushTest,
  'research/library': researchLibrary,
};

export function routeKey(url: string | undefined, rewritten?: unknown): string {
  const raw = typeof rewritten === 'string' && rewritten ? rewritten : (url || '').split('?')[0];
  return raw.replace(/^\/?api\//, '').replace(/^\/+|\/+$/g, '');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const rewritten = req.query?.__route;
  if (req.query) delete req.query.__route;
  const key = routeKey(req.url, rewritten);
  const route = ROUTES[key];
  if (!route) return res.status(404).json({ error: 'Not found' });
  // Lets withSentry name the route in an error report (see routeName).
  (req as unknown as Record<symbol, unknown>)[ROUTE_KEY] = key;
  // Maintenance (read-only) mode, OFF unless MAINTENANCE_MODE is set.
  if (blockIfMaintenance(key, req, res)) return;
  return route(req, res);
}
