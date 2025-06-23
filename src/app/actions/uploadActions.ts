
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { db } from "@/lib/firebase/config";
import { doc, getDoc, deleteDoc, collection, query, writeBatch, getDocs } from "firebase/firestore";


export async function uploadActivityMedia(activityId: string, formData: FormData) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_SUPABASE_URL") || supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    return { error: 'Konfigurasi Supabase tidak lengkap. Harap periksa variabel lingkungan Anda.' };
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const file = formData.get('file') as File;

  if (!file) {
    return { error: 'No file provided.' };
  }
  
  if (!file.type.startsWith('image/')) {
    return { error: 'Hanya file gambar yang diizinkan.' };
  }

  const fileExtension = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExtension}`;
  const filePath = `${activityId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('activities') // Nama bucket Anda
    .upload(filePath, file);

  if (uploadError) {
    console.error('Supabase upload error:', uploadError);
    if (uploadError.message.includes("Bucket not found")) {
        return { error: "Gagal mengunggah file: Bucket 'activities' tidak ditemukan. Harap buat bucket publik dengan nama 'activities' di dasbor Supabase Anda." };
    }
    if (uploadError.message.includes("violates row-level security policy")) {
      return { error: "Gagal mengunggah file: Kebijakan Keamanan Supabase (RLS) memblokir unggahan. Pastikan Anda telah membuat kebijakan yang mengizinkan unggahan publik ke bucket 'activities'." };
    }
    return { error: `Gagal mengunggah file: ${uploadError.message}` };
  }

  const { data: publicUrlData } = supabase.storage
    .from('activities')
    .getPublicUrl(filePath);
    
  if (!publicUrlData) {
      return { error: 'Gagal mendapatkan URL publik untuk file tersebut.' };
  }
    
  revalidatePath(`/new-activity/gallery?id=${activityId}`);
  return { url: publicUrlData.publicUrl };
}

export async function deleteActivityMedia(activityId: string, mediaId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_SUPABASE_URL") || supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    return { error: 'Konfigurasi Supabase tidak lengkap.' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const mediaDocRef = doc(db, "activities", activityId, "media", mediaId);
    const mediaDocSnap = await getDoc(mediaDocRef);

    if (!mediaDocSnap.exists()) {
      return { error: "Media tidak ditemukan di database." };
    }

    const mediaData = mediaDocSnap.data();
    const mediaUrl = mediaData.url;

    // Hanya coba hapus dari storage jika ini URL dari Supabase
    if (mediaUrl && mediaUrl.includes(supabaseUrl)) {
      const bucketName = 'activities';
      const urlObject = new URL(mediaUrl);
      // Pathname akan seperti: /storage/v1/object/public/activities/activity_id/file.jpg
      const pathParts = urlObject.pathname.split('/');
      // Cari indeks bucket di path untuk mendapatkan path file yang sebenarnya
      const bucketIndex = pathParts.indexOf(bucketName);
      if (bucketIndex !== -1 && bucketIndex < pathParts.length -1) {
        const filePath = pathParts.slice(bucketIndex + 1).join('/');
        
        const { error: storageError } = await supabase.storage
          .from(bucketName)
          .remove([filePath]);

        if (storageError) {
          // Log eror tapi jangan hentikan proses, file mungkin sudah tidak ada
          console.error("Supabase storage deletion error:", storageError.message);
        }
      }
    }

    // Selalu hapus dokumen dari Firestore
    await deleteDoc(mediaDocRef);

    revalidatePath(`/new-activity/gallery?id=${activityId}`);
    return { success: true };

  } catch (error: any) {
    console.error("Error deleting media:", error);
    return { error: `Gagal menghapus media: ${error.message}` };
  }
}

export async function deleteActivity(activityId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_SUPABASE_URL") || supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
        return { error: 'Konfigurasi Supabase tidak lengkap.' };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const batch = writeBatch(db);
    const mediaCollectionRef = collection(db, "activities", activityId, "media");
    const mediaQuery = query(mediaCollectionRef);

    try {
        const mediaSnapshot = await getDocs(mediaQuery);
        const filesToDeleteFromStorage: string[] = [];

        mediaSnapshot.forEach(mediaDoc => {
            const mediaData = mediaDoc.data();
            const mediaUrl = mediaData.url;
            if (mediaUrl && mediaUrl.includes(supabaseUrl)) {
                const bucketName = 'activities';
                try {
                    const urlObject = new URL(mediaUrl);
                    const pathParts = urlObject.pathname.split('/');
                    const bucketIndex = pathParts.indexOf(bucketName);
                    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
                        const filePath = pathParts.slice(bucketIndex + 1).join('/');
                        filesToDeleteFromStorage.push(filePath);
                    }
                } catch (e) {
                    console.error("URL tidak valid, lewati penghapusan dari storage:", mediaUrl, e);
                }
            }
            batch.delete(mediaDoc.ref);
        });

        const activityDocRef = doc(db, "activities", activityId);
        batch.delete(activityDocRef);
        await batch.commit();

        if (filesToDeleteFromStorage.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('activities')
                .remove(filesToDeleteFromStorage);
            
            if (storageError) {
                 console.error("Kesalahan penghapusan dari Supabase Storage:", storageError.message);
                 return { error: `Data Firestore dihapus, tetapi terjadi kesalahan saat menghapus file di storage: ${storageError.message}` };
            }
        }
        
        revalidatePath('/new-activity');
        return { success: true };

    } catch (error: any) {
        console.error("Kesalahan menghapus kegiatan:", error);
        return { error: `Gagal menghapus kegiatan: ${error.message}` };
    }
}
