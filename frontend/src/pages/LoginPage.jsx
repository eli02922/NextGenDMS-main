import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { FileText, Lock } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  if (user) {
    navigate(from, { replace: true });
    return null;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await login(email, password);
    setIsLoading(false);
    if (success) {
      navigate(from, { replace: true });
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await register(email, password, fullName);
    setIsLoading(false);
    if (success) {
      setFullName("");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1612538498488-226257115cc4?crop=entropy&cs=srgb&fm=jpg&q=85)`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div className="absolute inset-0 bg-white/50" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-heading font-bold text-primary">NextGen DMS</span>
          </div>
          <h1 className="text-3xl font-heading font-bold text-primary mb-2">
            Document Management System
          </h1>
          <p className="text-muted-foreground max-w-md">
            Secure document storage, version control, records management, and compliance tracking.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-heading font-bold">NextGen DMS</span>
          </div>

          <Card className="border shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-heading">Welcome</CardTitle>
              <CardDescription>Sign in to access your documents</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" data-testid="login-tab">Sign In</TabsTrigger>
                  <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="admin@paperless.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        data-testid="login-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="admin123"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        data-testid="login-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full btn-hover"
                      disabled={isLoading}
                      data-testid="login-submit"
                    >
                      {isLoading ? "Signing in..." : "Sign In"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-4">
                      Demo: admin@paperless.com / admin123
                    </p>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Full Name</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        data-testid="register-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="john@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        data-testid="register-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        data-testid="register-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full btn-hover"
                      disabled={isLoading}
                      data-testid="register-submit"
                    >
                      {isLoading ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            <Lock className="w-3 h-3 inline mr-1" />
            Secure, self-hosted document management
          </p>
        </div>
      </div>
    </div>
  );
}
