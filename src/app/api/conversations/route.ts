import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helper';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversations = await db.conversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, systemPrompt } = body;

    // Validate fields
    if (title && typeof title === 'string' && title.length > 200) {
      return NextResponse.json({ error: 'Title is too long (max 200 characters)' }, { status: 400 });
    }
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.length > 2000) {
      return NextResponse.json({ error: 'System prompt is too long (max 2,000 characters)' }, { status: 400 });
    }

    const conversation = await db.conversation.create({
      data: {
        title: title || 'New Chat',
        systemPrompt: systemPrompt || '',
        userId: session.user.id,
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all messages and conversations for this user (cascading)
    await db.message.deleteMany({
      where: {
        conversation: {
          userId: session.user.id,
        },
      },
    });

    await db.conversation.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting all conversations:', error);
    return NextResponse.json(
      { error: 'Failed to delete conversations' },
      { status: 500 }
    );
  }
}
