import { eq } from 'drizzle-orm';
import type { Db } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import { appUser, membership, workspace } from '#src/db/schema.ts';

export interface DefaultContext {
  workspaceId: string;
  userId: string;
}

/**
 * Giai đoạn đầu chỉ có 1 workspace + 1 user. Hàm idempotent: chạy nhiều lần vẫn ra cùng kết quả.
 * Khi có đăng nhập thật (M10), API lấy workspace/user từ phiên thay vì hàm này.
 */
export async function ensureDefaultWorkspace(
  db: Db,
  { workspaceName, userEmail }: { workspaceName: string; userEmail: string },
): Promise<DefaultContext> {
  const email = userEmail.toLowerCase();
  return db.transaction(async (tx) => {
    await tx.insert(appUser).values({ id: newId('user'), email }).onConflictDoNothing({ target: appUser.email });
    const [user] = await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email));
    if (!user) throw new Error(`Không tạo được user mặc định ${email}`);

    const [existing] = await tx
      .select({ workspaceId: membership.workspaceId })
      .from(membership)
      .where(eq(membership.userId, user.id))
      .limit(1);
    if (existing) return { workspaceId: existing.workspaceId, userId: user.id };

    const workspaceId = newId('workspace');
    await tx.insert(workspace).values({ id: workspaceId, name: workspaceName, settings: { autoScore: false, autoRevise: false } });
    await tx.insert(membership).values({ workspaceId, userId: user.id, role: 'owner' });
    return { workspaceId, userId: user.id };
  });
}
