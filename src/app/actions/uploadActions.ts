'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be provided.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function uploadActivityMedia(activityId: string, formData: FormData) {
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
