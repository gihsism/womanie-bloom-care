import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SelectUserType from "./pages/auth/SelectUserType";
import PatientSignUp from "./pages/auth/PatientSignUp";
import PatientLogIn from "./pages/auth/PatientLogIn";
import DoctorLogIn from "./pages/auth/DoctorLogIn";
import DoctorSignUp from "./pages/auth/DoctorSignUp";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import PatientDetails from "./pages/doctor/PatientDetails";
import FindDoctor from "./pages/FindDoctor";
import Settings from "./pages/dashboard/Settings";
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
import HealthStatistics from "./pages/HealthStatistics";
import MedicalHistory from "./pages/MedicalHistory";
import AIDoctorChat from "./pages/AIDoctorChat";
import Install from "./pages/Install";
import Devices from "./pages/dashboard/Devices";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <OnboardingProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </OnboardingProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
