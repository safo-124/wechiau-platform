import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  DASHBOARD_COOKIE,
  dashboardLoginRequestSchema,
  loginRequestSchema,
  type DashboardLoginRequest,
  type DashboardLoginResponse,
  type LoginRequest,
  type LoginResponse,
  type SessionUser,
} from '@wechiau/shared';
import type { Request, Response } from 'express';
import { ZodPipe } from '../common/zod.pipe.js';
import { AppConfig } from '../config.js';
import { CurrentAuth, Public } from './auth.decorators.js';
import { AuthService, type Authenticated } from './auth.service.js';

const DASHBOARD_SESSION_MS = 12 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  /** Phone apps: phone and password. The token goes in the phone's secure storage. */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginRequestSchema)) body: LoginRequest, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.login(body, req.ip);
  }

  /** Dashboard: email and password, admins only. The session goes in an HttpOnly cookie that page scripts can't read. */
  @Public()
  @Post('dashboard/login')
  @HttpCode(200)
  async dashboardLogin(
    @Body(new ZodPipe(dashboardLoginRequestSchema)) body: DashboardLoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DashboardLoginResponse> {
    const { token, user } = await this.auth.loginDashboard(body, req.ip);
    res.cookie(DASHBOARD_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.cookieSecure,
      path: '/api',
      maxAge: DASHBOARD_SESSION_MS,
    });
    return { user };
  }

  @Get('me')
  me(@CurrentAuth() auth: Authenticated): SessionUser {
    return auth.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAuth() auth: Authenticated, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(auth.sessionId);
    res.clearCookie(DASHBOARD_COOKIE, { path: '/api' });
  }
}
