import { NextRequest, NextResponse } from "next/server";
import { checkIsAdmin, tryVerifySessionToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export async function POST(req: NextRequest) {
  const session = await tryVerifySessionToken(req.cookies.get("session")?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await checkIsAdmin(session.email, session.sub);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const users = await prisma.user.findMany({
      include: {
        documents: {
          where: { folderId: null }
        }
      }
    });

    let migratedDocs = 0;
    let createdFolders = 0;

    for (const user of users) {
      if (user.documents.length === 0) continue;

      // Ensure user has the 4 default folders
      const existingFolders = await prisma.documentFolder.findMany({
        where: { userId: user.id }
      });

      const userFolders: Record<string, string> = {}; // map legacy category id to new folder id

      for (const cat of DOCUMENT_CATEGORIES) {
        let folder = existingFolders.find(f => f.name === cat.name);
        if (!folder) {
          folder = await prisma.documentFolder.create({
            data: {
              userId: user.id,
              name: cat.name,
              icon: cat.icon.displayName || 'Folder'
            }
          });
          createdFolders++;
        }
        userFolders[cat.id] = folder.id;
      }

      // Update documents
      for (const doc of user.documents) {
        if (doc.category && userFolders[doc.category]) {
          await prisma.document.update({
            where: { id: doc.id },
            data: { folderId: userFolders[doc.category] }
          });
          migratedDocs++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migração concluída. ${createdFolders} pastas criadas e ${migratedDocs} documentos movidos.`
    });

  } catch (e) {
    console.error("Migration error:", e);
    return NextResponse.json({ error: "Erro na migração" }, { status: 500 });
  }
}
