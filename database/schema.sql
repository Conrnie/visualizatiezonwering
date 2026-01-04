-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. STORAGE BUCKETS
-- -----------------------------------------------------------------------------
-- We need a bucket for storing uploaded user images and generated results.
-- In Supabase, you typically create this via the dashboard, but here is the SQL equivalent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('visualizations', 'visualizations', true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- Table: visualizations
-- Tracks every project created by a user.
CREATE TABLE public.visualizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Link to the user who created it (assuming Supabase Auth)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Project Metadata
    project_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    
    -- Storage Paths (relative to the 'visualizations' bucket)
    -- Example: 'user_123/project_456/input.jpg'
    input_image_path TEXT NOT NULL,
    output_image_path TEXT,
    
    -- Configuration (JSONB for flexibility)
    -- Stores the selected model, fabric, color, etc.
    -- Example: { "model": "markiezen", "fabric": "striped-red", "fabric_id": "123" }
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Error tracking
    error_message TEXT
);

-- Enable Row Level Security (RLS) to protect data
ALTER TABLE public.visualizations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES
-- -----------------------------------------------------------------------------

-- Policy: Users can view only their own visualizations
CREATE POLICY "Users can view their own visualizations"
ON public.visualizations
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can create visualizations (automatically assigns their own user_id)
CREATE POLICY "Users can insert their own visualizations"
ON public.visualizations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own visualizations (e.g., renaming)
CREATE POLICY "Users can update their own visualizations"
ON public.visualizations
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own visualizations
CREATE POLICY "Users can delete their own visualizations"
ON public.visualizations
FOR DELETE
USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. STORAGE POLICIES (for the 'visualizations' bucket)
-- -----------------------------------------------------------------------------

-- Allow authenticated users to upload files to their own folder
-- Assumption: Folder structure is {user_id}/{filename}
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'visualizations' 
    AND auth.role() = 'authenticated' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view files (public bucket or restricted)
-- If public, this isn't strictly necessary for reading, but good for private buckets.
CREATE POLICY "Allow authenticated viewing"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'visualizations' 
    AND auth.role() = 'authenticated'
);
