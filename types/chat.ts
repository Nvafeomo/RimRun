export type ConversationType = 'court' | 'dm' | 'group';

export type Conversation = {
  id: string;
  type: ConversationType;
  court_id?: string;
  name?: string;
  created_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  sender?: {
    username: string | null;
    profile_image_url: string | null;
  };
};
