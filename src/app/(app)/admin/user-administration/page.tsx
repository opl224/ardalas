
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCog, PlusCircle, Edit, Trash2, Eye, EyeOff } from "lucide-react";
// type { Metadata } from 'next'; // Metadata object is not used in client components.
import { useState, useEffect, type ReactNode } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";
import { useToast } from "@/hooks/use-toast";

// export const metadata: Metadata = { // Metadata object is not used in client components.
//   title: 'Administrasi Pengguna - EduCentral',
//   description: 'Kelola pengguna sistem EduCentral.',
// };

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  // In a real scenario, password hashes are never stored or sent to the client.
  // For creation, a temporary password might be set or generated.
}

const addUserFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  password: z.string().min(6, { message: "Password minimal 6 karakter." }),
  role: z.enum(ROLES, { message: "Pilih peran yang valid." }),
});
type AddUserFormValues = z.infer<typeof addUserFormSchema>;

const editUserFormSchema = z.object({
  id: z.string(),
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  role: z.enum(ROLES, { message: "Pilih peran yang valid." }),
});
type EditUserFormValues = z.infer<typeof editUserFormSchema>;


// Placeholder data - in a real app, this would come from Firestore
const initialUsers: User[] = [
  { id: "1", name: "Admin Utama", email: "admin@educentral.com", role: "admin" },
  { id: "2", name: "Budi Guru", email: "budi.guru@educentral.com", role: "guru" },
  { id: "3", name: "Siti Siswa", email: "siti.siswa@educentral.com", role: "siswa" },
  { id: "4", name: "Ayah Siti", email: "ayah.siti@educentral.com", role: "orangtua" },
];

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { toast } = useToast();

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "siswa",
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
  });

  useEffect(() => {
    if (selectedUser && isEditUserDialogOpen) {
      editUserForm.reset({
        id: selectedUser.id,
        name: selectedUser.name,
        email: selectedUser.email,
        role: selectedUser.role,
      });
    }
  }, [selectedUser, isEditUserDialogOpen, editUserForm]);

  const handleAddUserSubmit: SubmitHandler<AddUserFormValues> = async (data) => {
    // Simulate API call for adding user
    console.log("Adding user:", data);
    const newUser: User = {
      id: String(Date.now()), // Temporary ID
      name: data.name,
      email: data.email,
      role: data.role,
      // Password should not be stored in client state like this in a real app
    };
    setUsers((prevUsers) => [newUser, ...prevUsers]);
    toast({ title: "Pengguna Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
    setIsAddUserDialogOpen(false);
    addUserForm.reset();
    setShowPassword(false);
  };

  const handleEditUserSubmit: SubmitHandler<EditUserFormValues> = async (data) => {
    // Simulate API call for editing user
    console.log("Editing user:", data);
    if (!selectedUser) return;
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === data.id ? { ...user, name: data.name, email: data.email, role: data.role } : user
      )
    );
    toast({ title: "Pengguna Diperbarui", description: `${data.name} berhasil diperbarui.` });
    setIsEditUserDialogOpen(false);
    setSelectedUser(null);
  };

  const handleDeleteUser = (userId: string) => {
    // Simulate API call for deleting user
    console.log("Deleting user:", userId);
    setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
    toast({ title: "Pengguna Dihapus", description: `Pengguna berhasil dihapus.` });
    setSelectedUser(null); // Close delete confirmation if it was based on selectedUser
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  };
  
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    // The AlertDialog trigger will open the dialog
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Administrasi Pengguna</h1>
        <p className="text-muted-foreground">Kelola akun pengguna, peran, dan hak akses.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserCog className="h-6 w-6 text-primary" />
            <span>Manajemen Pengguna</span>
          </CardTitle>
          <Dialog open={isAddUserDialogOpen} onOpenChange={(isOpen) => {
            setIsAddUserDialogOpen(isOpen);
            if (!isOpen) {
              addUserForm.reset();
              setShowPassword(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pengguna
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                <DialogDescription>
                  Isi detail pengguna untuk membuat akun baru.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addUserForm.handleSubmit(handleAddUserSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Nama Lengkap</Label>
                  <Input id="name" {...addUserForm.register("name")} className="mt-1" />
                  {addUserForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...addUserForm.register("email")} className="mt-1" />
                  {addUserForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <Input id="password" type={showPassword ? "text" : "password"} {...addUserForm.register("password")} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  {addUserForm.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="role">Peran</Label>
                  <Select
                    onValueChange={(value) => addUserForm.setValue("role", value as Role)}
                    defaultValue={addUserForm.getValues("role")}
                  >
                    <SelectTrigger id="role" className="mt-1">
                      <SelectValue placeholder="Pilih peran" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleDisplayNames[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {addUserForm.formState.errors.role && (
                    <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.role.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addUserForm.formState.isSubmitting}>
                    {addUserForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Pengguna"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{roleDisplayNames[user.role]}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(user)}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit Pengguna</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(user)}>
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Hapus Pengguna</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tindakan ini tidak dapat diurungkan. Ini akan menghapus pengguna
                                <span className="font-semibold"> {selectedUser?.name} </span>
                                ({selectedUser?.email}) secara permanen.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setSelectedUser(null)}>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => selectedUser && handleDeleteUser(selectedUser.id)}>
                                Ya, Hapus Pengguna
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
             <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Tidak ada pengguna untuk ditampilkan. Klik "Tambah Pengguna" untuk membuat akun baru.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserDialogOpen} onOpenChange={(isOpen) => {
          setIsEditUserDialogOpen(isOpen);
          if (!isOpen) setSelectedUser(null);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>
              Perbarui detail pengguna. Perubahan email atau password mungkin memerlukan langkah tambahan.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={editUserForm.handleSubmit(handleEditUserSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editUserForm.register("id")} />
              <div>
                <Label htmlFor="edit-name">Nama Lengkap</Label>
                <Input id="edit-name" {...editUserForm.register("name")} className="mt-1" />
                {editUserForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" {...editUserForm.register("email")} className="mt-1" />
                {editUserForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-role">Peran</Label>
                <Select
                  onValueChange={(value) => editUserForm.setValue("role", value as Role)}
                  defaultValue={editUserForm.getValues("role")}
                >
                  <SelectTrigger id="edit-role" className="mt-1">
                    <SelectValue placeholder="Pilih peran" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleDisplayNames[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editUserForm.formState.errors.role && (
                  <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.role.message}</p>
                )}
              </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditUserDialogOpen(false); setSelectedUser(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editUserForm.formState.isSubmitting}>
                  {editUserForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    