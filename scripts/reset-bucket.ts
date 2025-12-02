import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const BUCKET_NAME = 'basecard-assets';

async function resetBucket() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_KEY not found in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Resetting bucket: ${BUCKET_NAME}`);

  try {
    // 1. List all files
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(undefined, { limit: 1000 }); // Adjust limit if needed, or implement pagination

    if (listError) {
      // If bucket doesn't exist, it's effectively empty (or we can't access it)
      if (listError.message.includes('not found')) {
        console.log(`Bucket "${BUCKET_NAME}" not found. Nothing to delete.`);
        return;
      }
      throw listError;
    }

    if (!files || files.length === 0) {
      console.log('Bucket is already empty.');
      return;
    }

    console.log(`Found ${files.length} files. Deleting...`);

    // 2. Delete all files
    const filesToDelete = files.map((file) => file.name);
    // Note: Supabase storage might have folders. 'list' returns items in root.
    // If there are folders, we need to handle them recursively or just delete everything if 'list' returns paths.
    // However, Supabase 'list' usually returns items in the current directory.
    // If we have nested structure like 'profiles/address/file.webp', we need to list recursively or delete by prefix if supported.
    // But Supabase storage doesn't support "delete bucket" easily via JS client without permissions.
    // Let's try to delete what we see. If we used folders, we might need a recursive delete.
    // Our S3Service uses `profiles/${dto.address}/...`.
    // So 'list' at root might only show 'profiles' folder?
    // Supabase storage 'list' behavior: lists files and folders in the path.

    // Recursive delete helper
    await emptyDirectory(supabase, BUCKET_NAME, '');

    console.log('Bucket reset successful.');
  } catch (err) {
    console.error('Error resetting bucket:', err);
    process.exit(1);
  }
}

async function emptyDirectory(supabase: any, bucket: string, path: string) {
  const { data: items, error } = await supabase.storage.from(bucket).list(path);

  if (error) throw error;
  if (!items || items.length === 0) return;

  const filesToDelete: string[] = [];

  for (const item of items) {
    if (item.id === null) {
      // It's a folder (Supabase returns null id for folders in some versions, or we check metadata)
      // Actually, Supabase storage list returns objects. Folders usually have no metadata or specific type.
      // But 'remove' expects file paths.
      // If it's a folder, we must recurse.
      // Let's assume if it has no 'metadata' it might be a folder, or we just try to list inside it.
      // A safer way for Supabase is to check if it has a mimetype?
      // Let's try to list inside it.
      const fullPath = path ? `${path}/${item.name}` : item.name;
      // Recursively empty the folder
      await emptyDirectory(supabase, bucket, fullPath);
    } else {
      // It's a file
      filesToDelete.push(path ? `${path}/${item.name}` : item.name);
    }
  }

  if (filesToDelete.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(filesToDelete);

    if (removeError) throw removeError;
    console.log(`Deleted ${filesToDelete.length} files from ${path || 'root'}`);
  }
}

resetBucket();
