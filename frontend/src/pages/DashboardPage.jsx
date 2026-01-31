import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth, API } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { FileText, Archive, Scale, Clock, Upload, ArrowRight, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, docsRes] = await Promise.all([
          axios.get(`${API}/dashboard/stats`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API}/documents?page_size=5`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        setStats(statsRes.data);
        setRecentDocs(docsRes.data);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const statCards = [
    { 
      title: "Total Documents", 
      value: stats?.total_documents || 0, 
      icon: FileText, 
      color: "text-primary",
      bgColor: "bg-primary/5"
    },
    { 
      title: "Declared Records", 
      value: stats?.total_records || 0, 
      icon: Archive, 
      color: "text-emerald-600",
      bgColor: "bg-emerald-50"
    },
    { 
      title: "Legal Holds", 
      value: stats?.legal_holds || 0, 
      icon: Scale, 
      color: "text-red-600",
      bgColor: "bg-red-50"
    },
    { 
      title: "Pending Disposition", 
      value: stats?.pending_dispositions || 0, 
      icon: Clock, 
      color: "text-amber-600",
      bgColor: "bg-amber-50"
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">
            Welcome back, {user?.full_name?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your documents today.
          </p>
        </div>
        <Link to="/upload">
          <Button className="btn-hover gap-2" data-testid="quick-upload-btn">
            <Upload className="w-4 h-4" />
            Upload Document
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={stat.title} 
              className={`border card-hover animate-fade-in stagger-${index + 1}`}
              data-testid={`stat-${stat.title.toLowerCase().replace(" ", "-")}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">
                      {stat.title}
                    </p>
                    <p className="text-3xl font-heading font-bold mt-2">
                      {loading ? "—" : stat.value}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded ${stat.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Documents */}
      <Card className="border">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-heading">Recent Documents</CardTitle>
          <Link to="/documents">
            <Button variant="ghost" size="sm" className="gap-1" data-testid="view-all-docs">
              View all
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="text-center py-12">
              <div 
                className="w-32 h-32 mx-auto mb-4 rounded-lg bg-cover bg-center opacity-50"
                style={{ backgroundImage: `url(https://images.unsplash.com/photo-1704807395127-898b64191a16?crop=entropy&cs=srgb&fm=jpg&q=85)` }}
              />
              <p className="text-muted-foreground">No documents yet</p>
              <Link to="/upload">
                <Button className="mt-4" variant="outline" data-testid="upload-first-doc">
                  Upload your first document
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((doc, index) => (
                <Link
                  key={doc.id}
                  to={`/documents/${doc.id}`}
                  className={`flex items-center gap-4 p-3 rounded border bg-card hover:bg-muted transition-colors table-row-hover animate-fade-in stagger-${index + 1}`}
                  data-testid={`recent-doc-${doc.id}`}
                >
                  <div className="w-10 h-10 rounded bg-primary/5 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      v{doc.current_version} • {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.is_record && (
                      <span className="text-xs px-2 py-0.5 rounded badge-record">Record</span>
                    )}
                    {doc.legal_hold && (
                      <span className="text-xs px-2 py-0.5 rounded badge-hold">Hold</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      doc.visibility === "ORG" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      doc.visibility === "GROUP" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      "bg-gray-50 text-gray-700 border-gray-200"
                    }`}>
                      {doc.visibility}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/records" className="block">
          <Card className="border card-hover h-full" data-testid="quick-records">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded bg-emerald-50 flex items-center justify-center">
                <Archive className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-heading font-semibold">Declare Records</h3>
                <p className="text-sm text-muted-foreground">Lock documents as official records</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/legal-holds" className="block">
          <Card className="border card-hover h-full" data-testid="quick-holds">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded bg-red-50 flex items-center justify-center">
                <Scale className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-heading font-semibold">Legal Holds</h3>
                <p className="text-sm text-muted-foreground">Prevent document modification</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/disposition" className="block">
          <Card className="border card-hover h-full" data-testid="quick-disposition">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded bg-amber-50 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-heading font-semibold">Disposition Queue</h3>
                <p className="text-sm text-muted-foreground">Review pending dispositions</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
