import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import AzureADProvider from 'next-auth/providers/azure-ad';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

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
    async jwt({ token, user, account }) {
      // On initial sign-in
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // Store Azure AD access token for Graph API (mail integration)
      if (account?.provider === 'azure-ad') {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;

        // Find or create user in our DB
        const email = token.email as string;
        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (!dbUser) {
          // Auto-create user from Azure AD with USER role
          dbUser = await prisma.user.create({
            data: {
              name: token.name as string ?? email.split('@')[0],
              email,
              password: '', // SSO user, no password
              role: 'USER',
            },
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
          // Token refresh failed — user will need to re-login
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
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
