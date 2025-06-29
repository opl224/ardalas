
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
import { CalendarDays, PlusCircle, Edit, Trash2, MoreVertical, Eye } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { useState, useEffect, useMemo } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

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

const ITEMS_PER_PAGE = 10;

export default function EventsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [isViewDetailDialogOpen, setIsViewDetailDialogOpen] = useState(false);
  const [selectedEventForView, setSelectedEventForView] = useState<EventData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { isMobile } = useSidebar();

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

  const openViewDialog = (event: EventData) => {
    setSelectedEventForView(event);
    setIsViewDetailDialogOpen(true);
  };

  const openEditDialog = (event: EventData) => {
    setSelectedEvent(event);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (event: EventData) => {
    setSelectedEvent(event);
  };

  const canManageEvents = role === "admin" || role === "guru";

  const totalPages = Math.ceil(events.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return events.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, events]);

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      if (currentPage <= Math.ceil(maxPagesToShow / 2)) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (currentPage + Math.floor(maxPagesToShow / 2) >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - Math.floor(maxPagesToShow / 2);
        endPage = currentPage + Math.floor(maxPagesToShow / 2);
      }
    }

    if (startPage > 1) {
      pageNumbers.push(<PaginationItem key="1"><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>);
      if (startPage > 2) {
        pageNumbers.push(<PaginationItem key="start-ellipsis"><PaginationEllipsis /></PaginationItem>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <PaginationItem key={i}>
          <PaginationLink onClick={() => setCurrentPage(i)} isActive={currentPage === i}>
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pageNumbers.push(<PaginationItem key="end-ellipsis"><PaginationEllipsis /></PaginationItem>);
      }
      pageNumbers.push(<PaginationItem key={totalPages}><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>);
    }
    return pageNumbers;
  };

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
            <div className="space-y-2 mt-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : currentTableData.length > 0 ? (
            <>
              <div className="overflow-x-auto mt-4">
                <Table className={cn("w-full", isMobile && "table-fixed")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={cn("w-[50px]", isMobile && "w-10 px-2 text-center")}>No.</TableHead>
                      <TableHead className={cn(isMobile ? "w-1/2" : "min-w-[200px]")}>Judul</TableHead>
                      <TableHead className={cn(isMobile ? "w-1/2" : "min-w-[120px]")}>Tanggal</TableHead>
                      {!isMobile && <TableHead className="min-w-[120px]">Waktu</TableHead>}
                      {!isMobile && <TableHead className="min-w-[150px]">Kategori</TableHead>}
                      {!isMobile && <TableHead className="min-w-[150px]">Target</TableHead>}
                      <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "")}>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTableData.map((event, index) => (
                      <TableRow key={event.id}>
                        <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium truncate" title={event.title}>{event.title}</TableCell>
                        <TableCell>{format(event.date.toDate(), isMobile ? "dd/MM/yy" : "dd MMM yyyy", { locale: indonesiaLocale })}</TableCell>
                        {!isMobile && <TableCell>{event.startTime}{event.endTime ? ` - ${event.endTime}` : (event.startTime ? ' - Selesai' : '-')}</TableCell>}
                        {!isMobile && <TableCell className="truncate" title={event.category || "-"}>{event.category || "-"}</TableCell>}
                        {!isMobile && <TableCell className="truncate" title={event.targetAudience && event.targetAudience.length > 0 ? event.targetAudience.map(r => roleDisplayNames[r] || r).join(", ") : "Semua"}>{event.targetAudience && event.targetAudience.length > 0 ? event.targetAudience.map(r => roleDisplayNames[r] || r).join(", ") : "Semua"}</TableCell>}
                        <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                          {role === 'admin' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${event.title}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openViewDialog(event)}>
                                  <Eye className="mr-2 h-4 w-4" /> Lihat Detail
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openEditDialog(event)}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDeleteDialog(event); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                      <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  {selectedEvent && selectedEvent.id === event.id && (
                                    <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus acara <span className="font-semibold">{selectedEvent?.title}</span>.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => setSelectedEvent(null)}>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteEvent(selectedEvent.id, selectedEvent.title)}>Ya, Hapus Acara</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  )}
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => openViewDialog(event)} aria-label={`Lihat detail ${event.title}`}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <Pagination className="mt-6">
                    <PaginationContent>
                        <PaginationItem>
                        <PaginationPrevious
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            aria-disabled={currentPage === 1}
                            className={cn("cursor-pointer", currentPage === 1 ? "pointer-events-none opacity-50" : undefined)}
                        />
                        </PaginationItem>
                        {renderPageNumbers()}
                        <PaginationItem>
                        <PaginationNext
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            aria-disabled={currentPage === totalPages}
                            className={cn("cursor-pointer", currentPage === totalPages ? "pointer-events-none opacity-50" : undefined)}
                        />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
              )}
            </>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada acara yang dijadwalkan.
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isViewDetailDialogOpen} onOpenChange={setIsViewDetailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Acara: {selectedEventForView?.title}</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai acara yang dipilih.
            </DialogDescription>
          </DialogHeader>
          {selectedEventForView && (
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
                <div><Label className="text-muted-foreground">Judul:</Label><p className="font-medium">{selectedEventForView.title}</p></div>
                <div><Label className="text-muted-foreground">Tanggal:</Label><p className="font-medium">{format(selectedEventForView.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</p></div>
                <div><Label className="text-muted-foreground">Waktu:</Label><p className="font-medium">{selectedEventForView.startTime}{selectedEventForView.endTime ? ` - ${selectedEventForView.endTime}` : (selectedEventForView.startTime ? ' - Selesai' : '-')}</p></div>
                <div><Label className="text-muted-foreground">Lokasi:</Label><p className="font-medium">{selectedEventForView.location || "-"}</p></div>
                <div><Label className="text-muted-foreground">Kategori:</Label><p className="font-medium">{selectedEventForView.category || "-"}</p></div>
                <div>
                  <Label className="text-muted-foreground">Target Audiens:</Label>
                  <p className="font-medium">
                    {selectedEventForView.targetAudience && selectedEventForView.targetAudience.length > 0 
                      ? selectedEventForView.targetAudience.map(r => roleDisplayNames[r] || r).join(", ") 
                      : "Semua"}
                  </p>
                </div>
                {selectedEventForView.description && (
                  <div><Label className="text-muted-foreground">Deskripsi:</Label><p className="font-medium whitespace-pre-line">{selectedEventForView.description}</p></div>
                )}
                {role === 'admin' && selectedEventForView.createdByName && (
                   <div><Label className="text-muted-foreground">Dibuat Oleh:</Label><p className="font-medium">{selectedEventForView.createdByName}</p></div>
                )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
