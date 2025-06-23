
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { db } from "@/lib/firebase/config";
import { doc, getDoc, deleteDoc, collection, query, writeBatch, getDocs } from "firebase/firestore";

export async function uploadActivityMedia(activityId: string, formData: FormData) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || supabaseUrl.includes("YOUR_SUPABASE_URL")) {
      return { error: 'Kesalahan Konfigurasi: NEXT_PUBLIC_SUPABASE_URL tidak diatur dengan benar di server.' };
    }
    if (!supabaseServiceKey || supabaseServiceKey.includes("YOUR_SUPABASE_KEY")) {
        return { error: 'Kesalahan Konfigurasi: SUPABASE_SERVICE_KEY tidak diatur dengan benar di server.' };
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const file = formData.get('file') as File;

    if (!file) {
      return { error: 'Tidak ada file yang terdeteksi dalam permintaan.' };
    }
    
    if (!file.type.startsWith('image/')) {
      return { error: `Tipe file tidak valid. Hanya gambar yang diizinkan, bukan ${file.type}.` };
    }

    const fileExtension = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExtension}`;
    const filePath = `${activityId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('activities')
      .upload(filePath, file, {
        contentType: file.type, // Explicitly set content type
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      if (uploadError.message.includes("Bucket not found")) {
          return { error: "Gagal mengunggah: Bucket 'activities' tidak ditemukan di Supabase. Pastikan bucket sudah dibuat dan bersifat publik." };
      }
      return { error: `Kesalahan Supabase: ${uploadError.message}. Periksa kebijakan bucket Anda.` };
    }

    const { data: publicUrlData } = supabase.storage
      .from('activities')
      .getPublicUrl(filePath);
      
    if (!publicUrlData) {
        return { error: 'Unggahan berhasil, tetapi gagal mendapatkan URL publik dari Supabase.' };
    }
      
    revalidatePath(`/new-activity/gallery?id=${activityId}`);
    
    return { url: publicUrlData.publicUrl, filePath: filePath }; // Return both url and path

  } catch (err: any) {
    console.error("Unexpected server error in uploadActivityMedia:", err);
    return { error: `Terjadi kesalahan tak terduga di server: ${err.message}` };
  }
}

export async function deleteActivityMedia(activityId: string, mediaId: string, filePath?: string | null, mediaUrl?: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes("YOUR_SUPABASE_URL") || supabaseServiceKey.includes("YOUR_SUPABASE_KEY")) {
      return { error: 'Konfigurasi Supabase tidak lengkap.' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, delete from Firestore
    const mediaDocRef = doc(db, "activities", activityId, "media", mediaId);
    await deleteDoc(mediaDocRef);
    
    // Now, delete from Supabase storage if a path is provided
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('activities')
        .remove([filePath]);

      if (storageError) {
        console.error("Supabase storage deletion error (using filePath):", storageError.message);
        // Don't block if Firestore delete succeeds, but notify user.
        return { success: true, warning: "Data dihapus dari database, tetapi file di storage gagal dihapus." };
      }
    } else if (mediaUrl && mediaUrl.includes(supabaseUrl)) {
      // Fallback for old data without filePath
      const bucketName = 'activities';
      const urlObject = new URL(mediaUrl);
      const pathParts = urlObject.pathname.split('/');
      const bucketIndex = pathParts.indexOf(bucketName);
      if (bucketIndex !== -1 && bucketIndex < pathParts.length -1) {
        const legacyFilePath = pathParts.slice(bucketIndex + 1).join('/');
        const { error: storageError } = await supabase.storage
          .from(bucketName)
          .remove([legacyFilePath]);
        if (storageError) {
          console.error("Supabase storage deletion error (legacy path):", storageError.message);
        }
      }
    }
    
    revalidatePath(`/new-activity/gallery?id=${activityId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting media:", error);
    return { error: `Gagal menghapus media: ${error.message}` };
  }
}

export async function deleteActivity(activityId: string) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

      if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes("YOUR_SUPABASE_URL") || supabaseServiceKey.includes("YOUR_SUPABASE_KEY")) {
          return { error: 'Konfigurasi Supabase tidak lengkap.' };
      }
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 1. Delete all Firestore media documents
      const batch = writeBatch(db);
      const mediaCollectionRef = collection(db, "activities", activityId, "media");
      const mediaQuery = query(mediaCollectionRef);
      const mediaSnapshot = await getDocs(mediaQuery);
      mediaSnapshot.forEach(mediaDoc => {
          batch.delete(mediaDoc.ref);
      });
      const activityDocRef = doc(db, "activities", activityId);
      batch.delete(activityDocRef);
      await batch.commit();

      // 2. Delete the entire folder from Supabase storage
      const { data: files, error: listError } = await supabase.storage
        .from('activities')
        .list(activityId, {
            limit: 100, // Adjust limit if you expect more files
        });

      if (listError) {
        console.error("Error listing files for deletion:", listError.message);
        return { error: `Data Firestore dihapus, tetapi gagal menghapus file di storage: ${listError.message}` };
      }

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${activityId}/${file.name}`);
        const { error: removeError } = await supabase.storage
            .from('activities')
            .remove(filePaths);
        
        if (removeError) {
          console.error("Kesalahan penghapusan dari Supabase Storage:", removeError.message);
          return { error: `Data Firestore dihapus, tetapi terjadi kesalahan saat menghapus folder di storage: ${removeError.message}` };
        }
      }
      
      revalidatePath('/new-activity');
      return { success: true };
    } catch (error: any) {
        console.error("Kesalahan menghapus kegiatan:", error);
        return { error: `Gagal menghapus kegiatan: ${error.message}` };
    }
}
