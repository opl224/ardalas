
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
import { useState, useEffect, type ReactNode } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword, type FirebaseError } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

interface User {
  id: string; // Corresponds to Firebase Auth UID and Firestore document ID
  name: string;
  email: string;
  role: Role;
  createdAt?: Timestamp; // Firestore timestamp
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

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
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

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      // Order by createdAt or name if available, for consistent listing
      const q = query(usersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: User[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        email: docSnap.data().email,
        role: docSnap.data().role,
        createdAt: docSnap.data().createdAt, // Assuming createdAt is stored
      }));
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users: ", error);
      toast({
        title: "Gagal Memuat Pengguna",
        description: "Terjadi kesalahan saat mengambil data pengguna.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
    addUserForm.clearErrors(); // Clear previous errors
    try {
      // 1. Create Firebase Auth user
      // IMPORTANT: Firebase client SDK's createUserWithEmailAndPassword will sign in the new user
      // on this client. This is not ideal for an admin panel.
      // A Firebase Function with Admin SDK is the recommended way for secure user creation by an admin.
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const newAuthUser = userCredential.user;

      // 2. Store user details (including role) in Firestore
      await setDoc(doc(db, "users", newAuthUser.uid), {
        // uid: newAuthUser.uid, // Not strictly needed as doc ID is uid
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Pengguna Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddUserDialogOpen(false);
      addUserForm.reset();
      setShowPassword(false);
      fetchUsers(); // Refetch users to include the new one
    } catch (error) {
      const firebaseError = error as FirebaseError;
      let errorMessage = "Gagal menambahkan pengguna.";
      if (firebaseError.code === "auth/email-already-in-use") {
        errorMessage = "Email ini sudah terdaftar.";
        addUserForm.setError("email", { type: "manual", message: errorMessage });
      } else if (firebaseError.code === "auth/weak-password") {
        errorMessage = "Password terlalu lemah (minimal 6 karakter).";
        addUserForm.setError("password", { type: "manual", message: errorMessage });
      } else if (firebaseError.code === "auth/invalid-email") {
        errorMessage = "Format email tidak valid.";
        addUserForm.setError("email", { type: "manual", message: errorMessage });
      }
      console.error("Error adding user:", firebaseError);
      toast({
        title: "Gagal Menambahkan Pengguna",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleEditUserSubmit: SubmitHandler<EditUserFormValues> = async (data) => {
    if (!selectedUser) return;
    editUserForm.clearErrors();
    try {
      const userDocRef = doc(db, "users", data.id);
      await updateDoc(userDocRef, {
        name: data.name,
        email: data.email, // Note: This updates Firestore email, not Firebase Auth email.
        role: data.role,
      });
      
      toast({ title: "Pengguna Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditUserDialogOpen(false);
      setSelectedUser(null);
      fetchUsers(); // Refetch users
    } catch (error) {
      console.error("Error editing user:", error);
      toast({
        title: "Gagal Memperbarui Pengguna",
        description: "Terjadi kesalahan saat memperbarui data pengguna.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string, userName?: string) => {
    try {
      // Note: This only deletes the user's document from Firestore.
      // It does NOT delete the user from Firebase Authentication.
      // Deleting Auth users requires Admin SDK, typically in a Firebase Function.
      await deleteDoc(doc(db, "users", userId));
      
      toast({ title: "Pengguna Dihapus (dari Database)", description: `${userName || 'Pengguna'} berhasil dihapus dari database. Akun otentikasi mungkin masih ada.` });
      setSelectedUser(null);
      fetchUsers(); // Refetch users
    } catch (error) {
      console.error("Error deleting user from Firestore:", error);
      toast({
        title: "Gagal Menghapus Pengguna",
        description: "Terjadi kesalahan saat menghapus pengguna dari database.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  };
  
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Administrasi Pengguna</h1>
        <p className="text-muted-foreground">Kelola akun pengguna, peran, dan hak akses. 
        <br /><strong className="text-destructive">Perhatian:</strong> Pengelolaan pengguna dari sisi klien memiliki batasan keamanan. Fitur lanjutan seperti penghapusan akun otentikasi atau penetapan peran yang aman idealnya melalui backend (mis. Firebase Functions).</p>
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
              addUserForm.clearErrors();
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
                  Isi detail pengguna untuk membuat akun baru. Password akan diatur untuk pengguna ini.
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
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
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
                    onValueChange={(value) => addUserForm.setValue("role", value as Role, { shouldValidate: true })}
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
          {isLoadingUsers ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : users.length > 0 ? (
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
                      <TableCell>{roleDisplayNames[user.role] || user.role}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(user)} aria-label={`Edit ${user.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(user)} aria-label={`Hapus ${user.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedUser && selectedUser.id === user.id && (
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus data pengguna <span className="font-semibold"> {selectedUser?.name} </span> ({selectedUser?.email}) dari database. Akun otentikasi Firebase pengguna ini TIDAK akan terhapus.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedUser(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name)}>
                                  Ya, Hapus dari Database
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          )}
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

      <Dialog open={isEditUserDialogOpen} onOpenChange={(isOpen) => {
          setIsEditUserDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedUser(null);
            editUserForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>
              Perbarui detail pengguna. Perubahan email hanya akan berpengaruh pada data di database, bukan pada akun otentikasi Firebase.
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
                  onValueChange={(value) => editUserForm.setValue("role", value as Role, { shouldValidate: true })}
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

    