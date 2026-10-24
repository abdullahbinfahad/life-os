import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SharedStatus = 'planning' | 'active' | 'on-hold' | 'done';
export type SharedRole = 'lead' | 'admin' | 'member' | 'guest' | 'viewer';
export type SharedTaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled';
export type SharedNoteType = 'decision' | 'meeting' | 'milestone' | 'sticky';

export interface SharedProject {
  id: string; title: string; description: string; status: SharedStatus; due_date: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface SharedMember { project_id: string; user_id: string; role: SharedRole; created_at: string; updated_at: string; display_name?: string }
export interface SharedTask {
  id: string; project_id: string; title: string; details: string; status: SharedTaskStatus;
  due_date: string | null; estimate_minutes: number | null; assignee_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface SharedDependency { project_id: string; task_id: string; depends_on_task_id: string; created_by: string | null; created_at: string }
export interface SharedComment {
  id: string; project_id: string; task_id: string | null; author_id: string | null; body: string;
  mentioned_user_ids: string[]; created_at: string; updated_at: string;
}
export interface SharedNote {
  id: string; project_id: string; note_type: SharedNoteType; title: string; body: string;
  occurred_on: string | null; created_by: string | null; created_at: string; updated_at: string; color: 'paper' | 'lavender' | 'mint' | 'sky'; is_pinned: boolean;
}
export interface SharedCommentReceipt { comment_id: string; user_id: string; seen_at: string }
export interface SharedActivity {
  id: string; project_id: string; actor_id: string | null; entity_type: string; entity_id: string | null;
  event_type: string; payload: Record<string, unknown>; created_at: string;
}
export interface SharedInvitation {
  id: string; project_id: string; role: Exclude<SharedRole, 'lead' | 'admin'>; invited_by: string | null;
  expires_at: string; revoked_at: string | null; accepted_at: string | null; accepted_by: string | null; created_at: string;
}
export interface SharedNotification {
  id: string; project_id: string; recipient_id: string; actor_id: string | null; kind: string;
  payload: Record<string, unknown>; read_at: string | null; created_at: string;
}
export interface SharedPortfolio { id: string; title: string; description: string; created_by: string | null; created_at: string; updated_at: string }
export interface SharedPortfolioMember { portfolio_id: string; user_id: string; role: 'lead' | 'admin' | 'member' | 'viewer' }
export interface SharedPortfolioProject { portfolio_id: string; project_id: string; added_by: string | null; created_at: string }
export interface PrivateTaskLink { id: string; task_id: string; user_id: string; personal_item_type: 'goal' | 'habit'; personal_item_id: string; created_at: string }
export interface SharedWorkspaceSnapshot {
  projects: SharedProject[]; members: SharedMember[]; tasks: SharedTask[]; dependencies: SharedDependency[];
  comments: SharedComment[]; commentReceipts: SharedCommentReceipt[]; notes: SharedNote[]; activity: SharedActivity[]; invitations: SharedInvitation[];
  notifications: SharedNotification[]; portfolios: SharedPortfolio[]; portfolioMembers: SharedPortfolioMember[];
  portfolioProjects: SharedPortfolioProject[];
}

const getClient = (): SupabaseClient => {
  if (!supabase) throw new Error('Cloud collaboration is not configured.');
  return supabase;
};
const throwIfError = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
const empty = <T,>(value: T[] | null | undefined) => value ?? [];

export function sharedServiceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (/could not embed because more than one relationship was found/i.test(message))
    return 'Could not load shared tasks. Please try again.';
  if (/row-level security|permission denied|not allowed|42501/i.test(message)) {
    if (/portfolio|shared_portfolio_projects/i.test(message)) return 'Only a portfolio lead or admin who is also a member of the shared project can add or remove that project. Portfolio links never grant project access.';
    return 'The server denied this collaboration action. Check your project membership and role; the app does not bypass database permissions.';
  }
  if (/PGRST202|PGRST205|42P01|42703|42883|schema cache|could not find the table|could not find the function|does not exist/i.test(message))
    return 'Shared workspace setup is incomplete. Run supabase/migrations/20261023_shared_projects.sql, then supabase/migrations/20261024_shared_workspace_upgrade.sql in the same Supabase project used by this app.';
  if (/23505|duplicate key|already exists/i.test(message)) return 'That item is already linked or already exists. Refresh the workspace and try again.';
  return message;
}

export async function fetchSharedWorkspace(currentUserId?: string, currentDisplayName?: string): Promise<SharedWorkspaceSnapshot> {
  const db = getClient();
  if (currentUserId && currentDisplayName?.trim()) {
    const profile = { user_id: currentUserId, display_name: currentDisplayName.trim().slice(0, 80), updated_at: new Date().toISOString() };
    const { error: insertError } = await db.from('shared_member_profiles').insert(profile);
    let profileError = insertError;
    if (insertError?.code === '23505') {
      const { error } = await db.from('shared_member_profiles').update({ display_name: profile.display_name, updated_at: profile.updated_at }).eq('user_id', currentUserId);
      profileError = error;
    }
    if (profileError) console.warn('Shared member display-name sync failed; continuing workspace load.', profileError);
  }
  const results = await Promise.all([
    db.from('shared_projects').select('id,title,description,status,due_date,created_by,created_at,updated_at').order('updated_at', { ascending: false }),
    db.from('shared_project_members').select('project_id,user_id,role,created_at,updated_at'),
    db.from('shared_portfolios').select('id,title,description,created_by,created_at,updated_at').order('updated_at', { ascending: false }),
    db.from('shared_portfolio_members').select('portfolio_id,user_id,role'),
    db.from('shared_project_notifications').select('id,project_id,recipient_id,actor_id,kind,payload,read_at,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of results) throwIfError(result.error);
  const projects = empty(results[0].data as SharedProject[] | null);
  const members = empty(results[1].data as SharedMember[] | null);
  const memberIds = [...new Set(members.map((member) => member.user_id))];
  const profilesResult = memberIds.length ? await db.from('shared_member_profiles').select('user_id,display_name').in('user_id', memberIds) : { data: [], error: null };
  throwIfError(profilesResult.error);
  const names = new Map(empty(profilesResult.data as Array<{ user_id: string; display_name: string }> | null).map((profile) => [profile.user_id, profile.display_name]));
  const projectsMembers = members.map((member) => ({ ...member, display_name: names.get(member.user_id) }));
  const projectIds = projects.map((project) => project.id);
  const portfolios = empty(results[2].data as SharedPortfolio[] | null);
  const portfolioIds = portfolios.map((portfolio) => portfolio.id);
  const [tasksResult, dependenciesResult, commentsResult, notesResult, activityResult, invitationsResult, portfolioProjectsResult] = await Promise.all([
    projectIds.length ? db.from('shared_project_tasks').select('id,project_id,title,details,status,due_date,estimate_minutes,assignee_id,created_by,created_at,updated_at').in('project_id', projectIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? db.from('shared_task_dependencies').select('project_id,task_id,depends_on_task_id,created_by,created_at').in('project_id', projectIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? db.from('shared_project_comments').select('id,project_id,task_id,author_id,body,mentioned_user_ids,created_at,updated_at').in('project_id', projectIds).order('created_at', { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? db.from('shared_project_notes').select('id,project_id,note_type,title,body,occurred_on,created_by,created_at,updated_at,color,is_pinned').in('project_id', projectIds).order('updated_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? db.from('shared_project_activity').select('id,project_id,actor_id,entity_type,entity_id,event_type,payload,created_at').in('project_id', projectIds).order('created_at', { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? db.from('shared_project_invitations').select('id,project_id,role,invited_by,expires_at,revoked_at,accepted_at,accepted_by,created_at').in('project_id', projectIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    portfolioIds.length ? db.from('shared_portfolio_projects').select('portfolio_id,project_id,added_by,created_at').in('portfolio_id', portfolioIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [tasksResult, dependenciesResult, commentsResult, notesResult, activityResult, invitationsResult, portfolioProjectsResult]) throwIfError(result.error);
  const comments = empty(commentsResult.data as SharedComment[] | null);
  const commentIds = comments.map((comment) => comment.id);
  const receiptsResult = commentIds.length ? await db.from('shared_project_comment_receipts').select('comment_id,user_id,seen_at').in('comment_id', commentIds) : { data: [], error: null };
  throwIfError(receiptsResult.error);
  return {
    projects,
    members: projectsMembers,
    tasks: empty(tasksResult.data as SharedTask[] | null),
    dependencies: empty(dependenciesResult.data as SharedDependency[] | null),
    comments,
    commentReceipts: empty(receiptsResult.data as SharedCommentReceipt[] | null),
    notes: empty(notesResult.data as SharedNote[] | null),
    activity: empty(activityResult.data as SharedActivity[] | null),
    invitations: empty(invitationsResult.data as SharedInvitation[] | null),
    notifications: empty(results[4].data as SharedNotification[] | null),
    portfolios,
    portfolioMembers: empty(results[3].data as SharedPortfolioMember[] | null),
    portfolioProjects: empty(portfolioProjectsResult.data as SharedPortfolioProject[] | null),
  };
}

export async function createSharedProject(title: string, description: string, status: SharedStatus = 'planning') {
  const { data, error } = await getClient().rpc('shared_create_project', { p_title: title, p_description: description, p_status: status });
  throwIfError(error); return data as string;
}
export async function createSharedInvitation(projectId: string, role: Exclude<SharedRole, 'lead' | 'admin'>, expiresAt: string) {
  const { data, error } = await getClient().rpc('shared_issue_project_invitation', { p_project_id: projectId, p_role: role, p_expires_at: expiresAt });
  throwIfError(error); return (data as Array<{ invitation_id: string; token: string; expires_at: string; role: string }>)[0];
}
export async function acceptSharedInvitation(token: string) {
  const { data, error } = await getClient().rpc('shared_accept_project_invitation', { p_token: token });
  throwIfError(error); return data as string;
}
export async function revokeSharedInvitation(id: string) { const { error } = await getClient().rpc('shared_revoke_project_invitation', { p_invitation_id: id }); throwIfError(error); }
export async function setSharedMemberRole(projectId: string, userId: string, role: SharedRole) { const { error } = await getClient().rpc('shared_set_project_member_role', { p_project_id: projectId, p_user_id: userId, p_role: role }); throwIfError(error); }
export async function removeSharedMember(projectId: string, userId: string) { const { error } = await getClient().rpc('shared_remove_project_member', { p_project_id: projectId, p_user_id: userId }); throwIfError(error); }
export async function updateSharedProject(id: string, patch: Partial<Pick<SharedProject, 'title' | 'description' | 'status' | 'due_date'>>) { const { error } = await getClient().from('shared_projects').update(patch).eq('id', id); throwIfError(error); }
export async function deleteSharedProject(id: string) { const { error } = await getClient().from('shared_projects').delete().eq('id', id); throwIfError(error); }
export async function createSharedTask(projectId: string, userId: string, title: string, dueDate?: string, assigneeId?: string) {
  const { data, error } = await getClient().from('shared_project_tasks').insert({ project_id: projectId, created_by: userId, title, due_date: dueDate || null, assignee_id: assigneeId || null }).select('id').single();
  throwIfError(error); if (!data) throw new Error('Task could not be created.'); return data.id as string;
}
export async function updateSharedTask(id: string, patch: Partial<Pick<SharedTask, 'title' | 'details' | 'status' | 'due_date' | 'estimate_minutes' | 'assignee_id'>>) { const { error } = await getClient().from('shared_project_tasks').update(patch).eq('id', id); throwIfError(error); }
export async function deleteSharedTask(id: string) { const { error } = await getClient().from('shared_project_tasks').delete().eq('id', id); throwIfError(error); }
export async function addSharedDependency(projectId: string, taskId: string, dependsOnTaskId: string, userId: string) { const { error } = await getClient().from('shared_task_dependencies').insert({ project_id: projectId, task_id: taskId, depends_on_task_id: dependsOnTaskId, created_by: userId }); throwIfError(error); }
export async function removeSharedDependency(projectId: string, taskId: string, dependsOnTaskId: string) { const { error } = await getClient().from('shared_task_dependencies').delete().eq('project_id', projectId).eq('task_id', taskId).eq('depends_on_task_id', dependsOnTaskId); throwIfError(error); }
export async function addSharedComment(projectId: string, userId: string, body: string, taskId?: string, mentionedUserIds: string[] = []) { const { error } = await getClient().from('shared_project_comments').insert({ project_id: projectId, task_id: taskId || null, author_id: userId, body, mentioned_user_ids: mentionedUserIds }); throwIfError(error); }
export async function addSharedNote(projectId: string, userId: string, noteType: SharedNoteType, title: string, body: string, occurredOn?: string, color: SharedNote['color'] = 'paper', isPinned = false) { const { error } = await getClient().from('shared_project_notes').insert({ project_id: projectId, created_by: userId, note_type: noteType, title, body, occurred_on: occurredOn || null, color, is_pinned: isPinned }); throwIfError(error); }
export async function updateSharedNote(id: string, patch: Partial<Pick<SharedNote, 'color' | 'is_pinned'>>) { const { error } = await getClient().from('shared_project_notes').update(patch).eq('id', id); throwIfError(error); }
export async function markSharedCommentsRead(projectId: string, userId: string, comments: SharedComment[]) {
  const rows = comments.filter((comment) => comment.project_id === projectId).map((comment) => ({ comment_id: comment.id, user_id: userId, seen_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await getClient().from('shared_project_comment_receipts').upsert(rows, { onConflict: 'comment_id,user_id', ignoreDuplicates: true }); throwIfError(error);
}
export async function setSharedCommentReadState(commentId: string, userId: string, isRead: boolean) {
  const db = getClient();
  if (isRead) { const { error } = await db.from('shared_project_comment_receipts').upsert({ comment_id: commentId, user_id: userId, seen_at: new Date().toISOString() }, { onConflict: 'comment_id,user_id', ignoreDuplicates: true }); throwIfError(error); }
  else { const { error } = await db.from('shared_project_comment_receipts').delete().eq('comment_id', commentId).eq('user_id', userId); throwIfError(error); }
}
export async function createSharedPortfolio(title: string, description: string) { const { data, error } = await getClient().rpc('shared_create_portfolio', { p_title: title, p_description: description }); throwIfError(error); return data as string; }
export async function addProjectToPortfolio(portfolioId: string, projectId: string, userId: string) { const { error } = await getClient().from('shared_portfolio_projects').insert({ portfolio_id: portfolioId, project_id: projectId, added_by: userId }); throwIfError(error); }
export async function removeProjectFromPortfolio(portfolioId: string, projectId: string) { const { error } = await getClient().from('shared_portfolio_projects').delete().eq('portfolio_id', portfolioId).eq('project_id', projectId); throwIfError(error); }
export async function addPrivateTaskLink(taskId: string, userId: string, type: 'goal' | 'habit', personalItemId: string) { const { error } = await getClient().from('shared_task_private_links').insert({ task_id: taskId, user_id: userId, personal_item_type: type, personal_item_id: personalItemId }); throwIfError(error); }
export async function removePrivateTaskLink(id: string) { const { error } = await getClient().from('shared_task_private_links').delete().eq('id', id); throwIfError(error); }
export async function fetchMyPrivateTaskLinks(taskIds: string[]): Promise<PrivateTaskLink[]> {
  if (!taskIds.length) return [];
  const { data, error } = await getClient().from('shared_task_private_links').select('id,task_id,user_id,personal_item_type,personal_item_id,created_at').in('task_id', taskIds);
  throwIfError(error); return empty(data as PrivateTaskLink[] | null);
}
export async function markSharedNotificationRead(id: string) { const { error } = await getClient().from('shared_project_notifications').update({ read_at: new Date().toISOString() }).eq('id', id); throwIfError(error); }

export interface AssignedSharedTask extends SharedTask { project_title: string }
export async function fetchMyAssignedSharedTasks(userId: string): Promise<AssignedSharedTask[]> {
  const { data, error } = await getClient().from('shared_project_tasks').select('id,project_id,title,details,status,due_date,estimate_minutes,assignee_id,created_by,created_at,updated_at,shared_projects!shared_project_tasks_project_id_fkey!inner(title)').eq('assignee_id', userId).in('status', ['todo', 'in-progress', 'blocked']).order('due_date', { ascending: true, nullsFirst: false });
  throwIfError(error);
  return empty(data as unknown as Array<SharedTask & { shared_projects: { title: string } }> | null).map((row) => ({ ...row, project_title: row.shared_projects.title }));
}

export function subscribeToSharedWorkspace(userId: string, onChange: () => void): () => void {
  const db = getClient();
  let channel: RealtimeChannel = db.channel(`lifeos-shared:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_project_members', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_project_tasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_project_comments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_project_notes' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_project_notifications', filter: `recipient_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { void db.removeChannel(channel); channel = undefined as unknown as RealtimeChannel; };
}
