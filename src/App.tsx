// Application root
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Lightweight pages — load eagerly (landing / auth / onboarding)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SelectUserType from "./pages/auth/SelectUserType";
import PatientSignUp from "./pages/auth/PatientSignUp";
import PatientLogIn from "./pages/auth/PatientLogIn";
import DoctorLogIn from "./pages/auth/DoctorLogIn";
import DoctorSignUp from "./pages/auth/DoctorSignUp";
import BasicInformation from "./pages/onboarding/BasicInformation";
import LifeStageSelection from "./pages/onboarding/LifeStageSelection";
import ModeSetup from "./pages/onboarding/ModeSetup";
import OnboardingSuccess from "./pages/onboarding/OnboardingSuccess";
import Product from "./pages/Product";
import ForPatients from "./pages/ForPatients";
import ForDoctors from "./pages/ForDoctors";
import About from "./pages/About";
import Pricing from "./pages/Pricing";
import Blog from "./pages/Blog";
import Install from "./pages/Install";
import Welcome from "./pages/Welcome";
import Community from "./pages/Community";

// Heavy pages — lazy loaded (dashboard / doctor / features)
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const DoctorDashboard = lazy(() => import("./pages/doctor/DoctorDashboard"));
const PatientDetails = lazy(() => import("./pages/doctor/PatientDetails"));
const FindDoctor = lazy(() => import("./pages/FindDoctor"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const HealthStatistics = lazy(() => import("./pages/HealthStatistics"));
const MedicalHistory = lazy(() => import("./pages/MedicalHistory"));
const AIDoctorChat = lazy(() => import("./pages/AIDoctorChat"));
const Devices = lazy(() => import("./pages/dashboard/Devices"));

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
          <BrowserRouter>
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
