import { useNavigate } from 'react-router-dom';
import { User, Stethoscope, Home } from 'lucide-react';
import { Card } from '@/components/ui/card';

const SelectUserType = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Home Button */}
      <div className="p-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-foreground hover:text-primary"
          aria-label="Go to home"
        >
          <Home className="h-5 w-5" />
          <span className="text-sm">Home</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-4xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary mb-2">Womanie</h1>
          </div>

          {/* Heading */}
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-3">Welcome to Womanie</h2>
            <p className="text-lg text-muted-foreground">How will you use the app?</p>
          </div>

          {/* Selection Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Patient Card */}
            <Card
              onClick={() => navigate('/auth/signup')}
              className="p-8 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <User className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Patient</h3>
                  <p className="text-muted-foreground">
                    Track your health, consult with doctors, and manage your reproductive wellness
                  </p>
                </div>
              </div>
            </Card>

            {/* Healthcare Provider Card */}
            <Card
              onClick={() => {
                // Placeholder for future implementation
                console.log('Healthcare Provider signup - Coming soon');
              }}
              className="p-8 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-secondary/50 group"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                  <Stethoscope className="h-10 w-10 text-secondary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Healthcare Provider</h3>
                  <p className="text-muted-foreground">
                    Provide care, review patient data, and manage consultations
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectUserType;
