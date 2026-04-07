import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import AzureADProvider from 'next-auth/providers/azure-ad';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// Azure AD group IDs for role mapping
const AZURE_GROUP_ADMIN = '2bbb6468-8e13-4ddc-808c-05bdec833c62'; // CRM_Admin
const AZURE_GROUP_USER = 'db55cc80-7ae4-467a-ac6d-49df5271c0e0';  // CRM_Benutzer

async function getAzureGroupIds(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value ?? []).map((g: any) => g.id);
  } catch {
    return [];
  }
}

function resolveRoleFromGroups(groupIds: string[]): 'ADMIN' | 'USER' | null {
  if (groupIds.includes(AZURE_GROUP_ADMIN)) return 'ADMIN';
  if (groupIds.includes(AZURE_GROUP_USER)) return 'USER';
  return null; // Not in any CRM group → deny access
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email User.Read Mail.Read Mail.Send',
        },
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-Mail', type: 'email' },
        password: { label: 'Passwort', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account }) {
      // For Azure AD: check group membership before allowing sign-in
      if (account?.provider === 'azure-ad' && account.access_token) {
        const groupIds = await getAzureGroupIds(account.access_token);
        const role = resolveRoleFromGroups(groupIds);
        if (!role) {
          // Not in CRM_Admin or CRM_Benutzer → block login
          return '/login?error=NoGroupAccess';
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // On initial sign-in
      if (user) {
        token.id = user.id;
        token.role = user.role;
      } else if (token.id) {
        // Refresh role from DB on each request (handles admin role changes)
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string }, select: { role: true } });
        if (dbUser) token.role = dbUser.role;
      }

      // Store Azure AD access token for Graph API (mail integration)
      if (account?.provider === 'azure-ad') {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;

        // Check Azure AD group membership → determine role
        const groupIds = account.access_token ? await getAzureGroupIds(account.access_token) : [];
        const role = resolveRoleFromGroups(groupIds);

        if (!role) {
          // User not in any CRM group → deny access
          token.error = 'NoGroupAccess';
          return token;
        }

        // Find or create user in our DB, sync role from Azure groups
        const email = token.email as string;
        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              name: token.name as string ?? email.split('@')[0],
              email,
              password: '', // SSO user, no password
              role,
            },
          });
        } else if (dbUser.role !== role) {
          // Sync role from Azure AD groups on every login
          dbUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: { role },
          });
        }
        token.id = dbUser.id;
        token.role = dbUser.role;
      }

      // Refresh expired access token
      if (token.accessTokenExpires && Date.now() > (token.accessTokenExpires as number)) {
        try {
          const params = new URLSearchParams({
            client_id: process.env.AZURE_AD_CLIENT_ID!,
            client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken as string,
            scope: 'openid profile email User.Read Mail.Read Mail.Send',
          });
          const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });
          const data = await res.json();
          if (data.access_token) {
            token.accessToken = data.access_token;
            token.refreshToken = data.refresh_token ?? token.refreshToken;
            token.accessTokenExpires = Date.now() + data.expires_in * 1000;
          }
        } catch {
          // Token refresh failed — clear tokens so frontend knows to re-login
          token.accessToken = undefined;
          token.accessTokenExpires = 0;
          token.error = 'RefreshTokenExpired';
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      if (token.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
