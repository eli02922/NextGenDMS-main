import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Users, Shield, UserPlus, Settings, Plus } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [editingUser, setEditingUser] = useState(null);
  const [editRoles, setEditRoles] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, groupsRes, rolesRes] = await Promise.all([
        axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/groups`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/roles`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    try {
      await axios.post(`${API}/groups`, newGroup, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Group created");
      setShowCreateGroup(false);
      setNewGroup({ name: "", description: "" });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create group");
    }
  };

  const handleUpdateRoles = async () => {
    if (!editingUser) return;
    try {
      await axios.put(`${API}/users/${editingUser.id}/roles`, editRoles, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("User roles updated");
      setEditingUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update roles");
    }
  };

  const openEditRoles = (user) => {
    setEditingUser(user);
    setEditRoles(user.roles || []);
  };

  const toggleRole = (role) => {
    setEditRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold">Administration</h1>
        <p className="text-muted-foreground mt-1">Manage users, groups, and permissions</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">
            <Shield className="w-4 h-4 mr-2" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="roles" data-testid="tab-roles">
            <Settings className="w-4 h-4 mr-2" />
            Roles
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card className="border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-heading">System Users</CardTitle>
              <div className="text-sm text-muted-foreground">{users.length} users</div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider">User</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Roles</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Groups</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Created</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(3)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <div className="h-12 bg-muted rounded animate-pulse" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id} className="table-row-hover" data-testid={`user-row-${user.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles?.map(role => (
                              <span 
                                key={role} 
                                className={`text-xs px-2 py-0.5 rounded border ${
                                  role === "admin" ? "bg-red-50 text-red-700 border-red-200" :
                                  role === "records_manager" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  role === "auditor" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-gray-50 text-gray-700 border-gray-200"
                                }`}
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.groups?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.groups.map(g => (
                                <span key={g} className="text-xs px-2 py-0.5 rounded bg-muted">{g}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge className="badge-record">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditRoles(user)}
                            data-testid={`edit-roles-${user.id}`}
                          >
                            Edit Roles
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
              <DialogTrigger asChild>
                <Button className="btn-hover" data-testid="create-group-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Group</DialogTitle>
                  <DialogDescription>
                    Create a new group for organizing users and document access.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      placeholder="Group name"
                      value={newGroup.name}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="group-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      placeholder="Group description"
                      value={newGroup.description}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                      data-testid="group-description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
                  <Button onClick={handleCreateGroup} data-testid="confirm-create-group">Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg font-heading">Groups</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider">Group</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Members</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-12">
                        <Shield className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="text-muted-foreground">No groups created yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    groups.map((group) => (
                      <TableRow key={group.id} className="table-row-hover" data-testid={`group-row-${group.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{group.name}</p>
                            <p className="text-xs text-muted-foreground">{group.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {group.members?.length || 0} members
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(group.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg font-heading">System Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {roles.map((role) => (
                  <div 
                    key={role.id} 
                    className="p-4 rounded border bg-card"
                    data-testid={`role-${role.id}`}
                  >
                    <h3 className="font-heading font-semibold capitalize">{role.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Permissions</p>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions?.map(perm => (
                          <span key={perm} className="text-xs px-2 py-0.5 rounded bg-muted mono">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Roles Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Roles</DialogTitle>
            <DialogDescription>
              {editingUser?.full_name} ({editingUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-3">
              {roles.map((role) => (
                <label 
                  key={role.id}
                  className="flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={editRoles.includes(role.name)}
                    onChange={() => toggleRole(role.name)}
                    className="rounded"
                    data-testid={`role-checkbox-${role.name}`}
                  />
                  <div>
                    <p className="font-medium capitalize">{role.name}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleUpdateRoles} data-testid="save-roles">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
