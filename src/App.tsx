// Application root
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InstallBanner } from "@/components/InstallBanner";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { Loader2 } from "lucide-react";

// Custom auth — no third-party dependency

// Eager imports only for what the very first paint needs — the
// landing page and the catch-all 404. Everything else is lazy: a
// returning logged-in user landing on /dashboard shouldn't pay the
// download cost of the marketing pages they aren't going to visit.
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Marketing / static pages — visited rarely by authenticated users, so
// they don't belong in the initial bundle.
const SelectUserType = lazy(() => import("./pages/auth/SelectUserType"));
const PatientSignUp = lazy(() => import("./pages/auth/PatientSignUp"));
const PatientLogIn = lazy(() => import("./pages/auth/PatientLogIn"));
const DoctorLogIn = lazy(() => import("./pages/auth/DoctorLogIn"));
const DoctorSignUp = lazy(() => import("./pages/auth/DoctorSignUp"));
const BasicInformation = lazy(() => import("./pages/onboarding/BasicInformation"));
const LifeStageSelection = lazy(() => import("./pages/onboarding/LifeStageSelection"));
const ModeSetup = lazy(() => import("./pages/onboarding/ModeSetup"));
const OnboardingSuccess = lazy(() => import("./pages/onboarding/OnboardingSuccess"));
const Product = lazy(() => import("./pages/Product"));
const ForPatients = lazy(() => import("./pages/ForPatients"));
const ForDoctors = lazy(() => import("./pages/ForDoctors"));
const About = lazy(() => import("./pages/About"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Blog = lazy(() => import("./pages/Blog"));
const Install = lazy(() => import("./pages/Install"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Community = lazy(() => import("./pages/Community"));

// Heavy pages — lazy loaded (dashboard / doctor / features)
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const DoctorDashboard = lazy(() => import("./pages/doctor/DoctorDashboard"));
const PatientDetails = lazy(() => import("./pages/doctor/PatientDetails"));
const DoctorApprovals = lazy(() => import("./pages/admin/DoctorApprovals"));
const Notifications = lazy(() => import("./pages/dashboard/Notifications"));
const Help = lazy(() => import("./pages/dashboard/Help"));
const Privacy = lazy(() => import("./pages/dashboard/Privacy"));
const Emergency = lazy(() => import("./pages/dashboard/Emergency"));
const CompareDocs = lazy(() => import("./pages/dashboard/CompareDocs"));
const PanelDetail = lazy(() => import("./pages/dashboard/PanelDetail"));
const PrintDoc = lazy(() => import("./pages/dashboard/PrintDoc"));
const PrintHealthRecord = lazy(() => import("./pages/dashboard/PrintHealthRecord"));
const Appointments = lazy(() => import("./pages/dashboard/Appointments"));
const FindDoctor = lazy(() => import("./pages/FindDoctor"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const HealthStatistics = lazy(() => import("./pages/HealthStatistics"));
const MedicalHistory = lazy(() => import("./pages/MedicalHistory"));
const AIDoctorChat = lazy(() => import("./pages/AIDoctorChat"));
const Devices = lazy(() => import("./pages/dashboard/Devices"));
const RecoverDocuments = lazy(() => import("./pages/RecoverDocuments"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <OnboardingProvider>
          <Toaster />
          <Sonner />
          <OfflineIndicator />
          <BrowserRouter>
            <InstallBanner />
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/product" element={<Product />} />
                  <Route path="/for-patients" element={<ForPatients />} />
                  <Route path="/for-doctors" element={<ForDoctors />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/auth/select-type" element={<SelectUserType />} />
                  <Route path="/auth/signup" element={<PatientSignUp />} />
                  <Route path="/auth/login" element={<PatientLogIn />} />
                  <Route path="/auth/doctor-login" element={<DoctorLogIn />} />
                  <Route path="/auth/doctor-signup" element={<DoctorSignUp />} />
                  <Route path="/dashboard" element={<PatientDashboard />} />
                  <Route path="/dashboard/settings" element={<Settings />} />
                  <Route path="/find-doctor" element={<FindDoctor />} />
                  <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
                  <Route path="/doctor/patient/:patientId" element={<PatientDetails />} />
                  <Route path="/health-statistics" element={<HealthStatistics />} />
                  <Route path="/dashboard/medical-history" element={<MedicalHistory />} />
                  <Route path="/dashboard/ai-doctor" element={<AIDoctorChat />} />
                  <Route path="/onboarding/basic-info" element={<BasicInformation />} />
                  <Route path="/onboarding/life-stage" element={<LifeStageSelection />} />
                  <Route path="/onboarding/mode-setup" element={<ModeSetup />} />
                  <Route path="/onboarding/success" element={<OnboardingSuccess />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/dashboard/devices" element={<Devices />} />
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/community" element={<Community />} />
                  <Route path="/dashboard/recover-documents" element={<RecoverDocuments />} />
                  <Route path="/admin/doctors" element={<DoctorApprovals />} />
                  <Route path="/dashboard/notifications" element={<Notifications />} />
                  <Route path="/dashboard/help" element={<Help />} />
                  <Route path="/dashboard/privacy" element={<Privacy />} />
                  <Route path="/dashboard/emergency" element={<Emergency />} />
                  <Route path="/dashboard/compare" element={<CompareDocs />} />
                  <Route path="/dashboard/panel/:slug" element={<PanelDetail />} />
                  <Route path="/dashboard/doc/:id/print" element={<PrintDoc />} />
                  <Route path="/dashboard/health-record/print" element={<PrintHealthRecord />} />
                  <Route path="/dashboard/appointments" element={<Appointments />} />
                  {/* Dashboard menu entries that historically pointed to
                      dedicated pages we never shipped. Redirect them to
                      sensible existing destinations instead of bouncing
                      the user to a 404. */}
                  <Route path="/dashboard/about" element={<Navigate to="/about" replace />} />
                  <Route path="/dashboard/profile" element={<Navigate to="/dashboard/settings" replace />} />
                  <Route path="/dashboard/terms" element={<Navigate to="/about" replace />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </OnboardingProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
