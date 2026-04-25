'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ProfileDialog } from '@/components/auth/profile-dialog';
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
  Pencil,
} from 'lucide-react';

export function UserMenu() {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!session?.user) return null;

  const initials = session.user.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.[0].toUpperCase() || '?';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 h-9 px-2"
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt="Avatar"
                className="h-7 w-7 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (
                    e.target as HTMLImageElement
                  ).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div
              className={`h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                session.user.image ? 'hidden' : ''
              }`}
            >
              {initials}
            </div>
            <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
              {session.user.name || session.user.email}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {session.user.name || 'No name'}
              </p>
              <p className="text-xs text-muted-foreground leading-none mt-1">
                {session.user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
