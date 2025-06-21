
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CalendarDays, PlusCircle, Edit, Trash2, AlertCircle, Save } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { useState, useEffect } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/config";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";

const EVENT_CATEGORIES = ["Akademik", "Olahraga", "Seni & Budaya", "Libur Nasional", "Peringatan Sekolah", "Rapat", "Lainnya"] as const;
type EventCategory = typeof EVENT_CATEGORIES[number];

interface EventData {
  id: string;
  title: string;
  description?: string;
  date: Timestamp;
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  location?: string;
  category?: EventCategory;
  targetAudience?: Role[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdById?: string;
  createdByName?: string;
}

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const _baseEventObjectSchema = z.object({
  title: z.string().min(3, { message: "Judul acara minimal 3 karakter." }),
  description: z.string().optional(),
  date: z.date({ required_error: "Tanggal acara harus diisi." }),
  startTime: z.string().regex(timeRegex, { message: "Format JJ:MM." }).optional().or(z.literal("")),
  endTime: z.string().regex(timeRegex, { message: "Format JJ:MM." }).optional().or(z.literal("")),
  location: z.string().optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  targetAudience: z.array(z.enum(ROLES)).optional(),
});

const eventTimeRefinement = (data: { startTime?: string; endTime?: string }) => {
  if (data.startTime && data.endTime) {
    const [startH, startM] = data.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return true; // Let regex handle format errors
    return endH > startH || (endH === startH && endM > startM);
  }
  return true;
};

const eventFormSchema = _baseEventObjectSchema.refine(eventTimeRefinement, {
  message: "Waktu selesai harus setelah waktu mulai.",
  path: ["endTime"],
});
type EventFormValues = z.infer<typeof eventFormSchema>;

const editEventFormSchema = _baseEventObjectSchema.extend({ id: z.string() }).refine(eventTimeRefinement, {
  message: "Waktu selesai harus setelah waktu mulai.",
  path: ["endTime"],
});
type EditEventFormValues = z.infer<typeof editEventFormSchema>;

export default function EventsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);

  const { toast } = useToast();

  const addEventForm = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      date: startOfDay(new Date()),
      startTime: "",
      endTime: "",
      location: "",
      category: undefined,
      targetAudience: [],
    },
  });

  const editEventForm = useForm<EditEventFormValues>({
    resolver: zodResolver(editEventFormSchema),
  });

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const eventsCollectionRef = collection(db, "events");
      const q = query(eventsCollectionRef, orderBy("date", "desc"), orderBy("startTime", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedEvents = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as EventData[];
      setEvents(fetchedEvents);
    } catch (error) {
      console.error("Error fetching events: ", error);
      toast({ title: "Gagal Memuat Acara", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchEvents();
  }, [authLoading]);

  useEffect(() => {
    if (selectedEvent && isEditDialogOpen) {
      editEventForm.reset({
        id: selectedEvent.id,
        title: selectedEvent.title,
        description: selectedEvent.description || "",
        date: selectedEvent.date.toDate(), // Convert Firestore Timestamp to JS Date
        startTime: selectedEvent.startTime || "",
        endTime: selectedEvent.endTime || "",
        location: selectedEvent.location || "",
        category: selectedEvent.category || undefined,
        targetAudience: selectedEvent.targetAudience || [],
      });
    }
  }, [selectedEvent, isEditDialogOpen, editEventForm]);

  const handleAddEventSubmit: SubmitHandler<EventFormValues> = async (data) => {
    if (!user) {
        toast({ title: "Aksi Ditolak", description: "Anda harus login untuk menambahkan acara.", variant: "destructive"});
        return;
    }
    addEventForm.clearErrors();
    try {
      await addDoc(collection(db, "events"), {
        ...data,
        date: Timestamp.fromDate(startOfDay(data.date)),
        targetAudience: data.targetAudience || [],
        createdById: user.uid,
        createdByName: user.displayName || user.email || "N/A",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Acara Ditambahkan", description: `${data.title} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addEventForm.reset({ date: startOfDay(new Date()), title: "", description: "", startTime: "", endTime: "", location: "", category: undefined, targetAudience: [] });
      fetchEvents();
    } catch (error) {
      console.error("Error adding event:", error);
      toast({ title: "Gagal Menambahkan Acara", variant: "destructive" });
    }
  };

  const handleEditEventSubmit: SubmitHandler<EditEventFormValues> = async (data) => {
    if (!selectedEvent || !user) {
        toast({ title: "Aksi Ditolak", description: "Data atau pengguna tidak valid.", variant: "destructive"});
        return;
    }
    editEventForm.clearErrors();
    try {
      const eventDocRef = doc(db, "events", data.id);
      await updateDoc(eventDocRef, {
        ...data,
        date: Timestamp.fromDate(startOfDay(data.date)),
        targetAudience: data.targetAudience || [],
        // createdById: user.uid, // Keep original creator or update, policy decision. For now, update.
        // createdByName: user.displayName || user.email || "N/A",
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Acara Diperbarui", description: `${data.title} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedEvent(null);
      fetchEvents();
    } catch (error) {
      console.error("Error editing event:", error);
      toast({ title: "Gagal Memperbarui Acara", variant: "destructive" });
    }
  };

  const handleDeleteEvent = async (eventId: string, eventTitle?: string) => {
    try {
      await deleteDoc(doc(db, "events", eventId));
      toast({ title: "Acara Dihapus", description: `${eventTitle || 'Acara'} berhasil dihapus.` });
      setSelectedEvent(null);
      fetchEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
      toast({ title: "Gagal Menghapus Acara", variant: "destructive" });
    }
  };

  const openEditDialog = (event: EventData) => {
    setSelectedEvent(event);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (event: EventData) => {
    setSelectedEvent(event);
  };

  const canManageEvents = role === "admin" || role === "guru";

  if (authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Manajemen Acara Sekolah</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6 flex items-center justify-center p-8"><LottieLoader width={32} height={32} className="mr-2" />Memuat...</CardContent></Card>
      </div>
    );
  }

  const renderFormFields = (formInstance: typeof addEventForm | typeof editEventForm, dialogType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${dialogType}-event-title`}>Judul Acara</Label>
        <Input id={`${dialogType}-event-title`} {...formInstance.register("title")} className="mt-1" />
        {(formInstance.formState.errors as any).title && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).title.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-event-date`}>Tanggal Acara</Label>
        <Controller
            control={formInstance.control}
            name="date"
            render={({ field }) => (
                <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={field.value} onSelect={(date) => field.onChange(date ? startOfDay(date) : startOfDay(new Date()))} initialFocus />
                    </PopoverContent>
                </Popover>
            )}
        />
        {(formInstance.formState.errors as any).date && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).date.message}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${dialogType}-event-startTime`}>Waktu Mulai (Opsional)</Label>
          <Input id={`${dialogType}-event-startTime`} type="time" {...formInstance.register("startTime")} className="mt-1" />
           {(formInstance.formState.errors as any).startTime && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).startTime.message}</p>}
        </div>
        <div>
          <Label htmlFor={`${dialogType}-event-endTime`}>Waktu Selesai (Opsional)</Label>
          <Input id={`${dialogType}-event-endTime`} type="time" {...formInstance.register("endTime")} className="mt-1" />
          {(formInstance.formState.errors as any).endTime && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).endTime.message}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor={`${dialogType}-event-location`}>Lokasi (Opsional)</Label>
        <Input id={`${dialogType}-event-location`} {...formInstance.register("location")} className="mt-1" />
      </div>
       <div>
        <Label htmlFor={`${dialogType}-event-category`}>Kategori (Opsional)</Label>
        <Controller
            name="category"
            control={formInstance.control}
            render={({ field }) => (
                 <select {...field} defaultValue={field.value || ""} className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">Pilih Kategori</option>
                    {EVENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
            )}
        />
      </div>
      <div>
        <Label>Target Audiens (Opsional)</Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map((roleKey) => (
            <FormField
              key={roleKey}
              control={formInstance.control}
              name="targetAudience"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value?.includes(roleKey)}
                      onCheckedChange={(checked) => {
                        return checked
                          ? field.onChange([...(field.value || []), roleKey])
                          : field.onChange(
                              (field.value || []).filter(
                                (value) => value !== roleKey
                              )
                            );
                      }}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    {roleDisplayNames[roleKey]}
                  </FormLabel>
                </FormItem>
              )}
            />
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor={`${dialogType}-event-description`}>Deskripsi (Opsional)</Label>
        <Textarea id={`${dialogType}-event-description`} {...formInstance.register("description")} className="mt-1" />
      </div>
    </>
  );


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Acara Sekolah</h1>
        <p className="text-muted-foreground">Kelola semua kegiatan dan acara penting sekolah.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarDays className="h-6 w-6 text-primary" />
            <span>Daftar Acara</span>
          </CardTitle>
          {canManageEvents && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) { addEventForm.reset({ date: startOfDay(new Date()), title: "", description: "", startTime: "", endTime: "", location: "", category: undefined, targetAudience: [] }); addEventForm.clearErrors(); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Tambah Acara</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Tambah Acara Baru</DialogTitle><DialogDescription>Isi detail acara sekolah.</DialogDescription></DialogHeader>
                <Form {...addEventForm}>
                <form onSubmit={addEventForm.handleSubmit(handleAddEventSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {renderFormFields(addEventForm, 'add')}
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={addEventForm.formState.isSubmitting}>
                      {addEventForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}
                      Simpan Acara
                    </Button>
                  </DialogFooter>
                </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 mt-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : events.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Judul</TableHead>
                    <TableHead className="min-w-[120px]">Tanggal</TableHead>
                    <TableHead className="min-w-[120px]">Waktu</TableHead>
                    <TableHead className="min-w-[150px]">Kategori</TableHead>
                    <TableHead className="min-w-[150px]">Target</TableHead>
                    {canManageEvents && <TableHead className="text-right min-w-[100px]">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell>{format(event.date.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}</TableCell>
                      <TableCell>{event.startTime}{event.endTime ? ` - ${event.endTime}` : (event.startTime ? ' - Selesai' : '-')}</TableCell>
                      <TableCell>{event.category || "-"}</TableCell>
                      <TableCell>{event.targetAudience && event.targetAudience.length > 0 ? event.targetAudience.map(r => roleDisplayNames[r] || r).join(", ") : "Semua"}</TableCell>
                      {canManageEvents && (
                        <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(event)} aria-label={`Edit acara ${event.title}`}><Edit className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="destructive" size="icon" onClick={() => openDeleteDialog(event)} aria-label={`Hapus acara ${event.title}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                            {selectedEvent && selectedEvent.id === event.id && (
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus acara <span className="font-semibold">{selectedEvent?.title}</span>.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setSelectedEvent(null)}>Batal</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteEvent(selectedEvent.id, selectedEvent.title)}>Ya, Hapus Acara</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            )}
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada acara yang dijadwalkan.
            </div>
          )}
        </CardContent>
      </Card>

      {canManageEvents && selectedEvent && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) { setSelectedEvent(null); editEventForm.clearErrors(); }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit Acara</DialogTitle><DialogDescription>Perbarui detail acara sekolah.</DialogDescription></DialogHeader>
             <Form {...editEventForm}>
            <form onSubmit={editEventForm.handleSubmit(handleEditEventSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editEventForm.register("id")} />
              {renderFormFields(editEventForm, 'edit')}
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={editEventForm.formState.isSubmitting}>
                  {editEventForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}
                  Simpan Perubahan</Button>
              </DialogFooter>
            </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}




