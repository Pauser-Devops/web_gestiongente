import { supabase } from '../lib/supabase'

export const uploadProfilePicture = async (userId, file) => {
    try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${userId}-${Math.random()}.${fileExt}`
        const filePath = `${fileName}`

        // 1. Subir imagen al bucket 'avatars'
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file)

        if (uploadError) throw uploadError

        // 2. Obtener URL pública
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath)

        return { publicUrl, error: null }
    } catch (error) {
        console.error('Error uploading profile picture:', error)
        return { publicUrl: null, error }
    }
}

export const updateUserProfilePicture = async (employeeId, url) => {
    try {
        const { error } = await supabase
            .from('employees')
            .update({ profile_picture_url: url })
            .eq('id', employeeId)

        if (error) throw error
        return { error: null }
    } catch (error) {
        console.error('Error updating profile:', error)
        return { error }
    }
}
