import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          include: { accounts: true },
        });

        if (!user) return null;

        // Find the credentials account (not OAuth accounts)
        const credentialAccount = user.accounts.find(
          (a) => a.provider === 'credentials' && a.passwordHash
        );
        if (!credentialAccount) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          credentialAccount.passwordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // On initial sign-in: populate token from user
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      // On session update (e.g. after profile edit): re-fetch from DB
      if (trigger === 'update' && session) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, image: true },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.picture = dbUser.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
