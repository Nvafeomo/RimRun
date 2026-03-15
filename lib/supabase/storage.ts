import { supabase } from "../supabase";
import { File } from "expo-file-system";
export const uploadProfilePicture = async (userID: string, imageUri: string) => {
    try{
        const fileExtension = imageUri.split('.').pop();
        const fileName = `${userID}/profile.${fileExtension}`;
        const file = new File(imageUri);
        const bytes = await file.bytes();
        const filePath = `${userID}/${fileName}`;
        const { error } = await supabase.storage.from('Avatars').upload(fileName, bytes, {contentType: `image/${fileExtension}`, upsert: true});
        if (error) {
            console.error('Error uploading profile picture:', error);
            throw error;
        }
        const {data: urlData} = supabase.storage
            .from('Avatars')
            .getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        throw error;
    }
}