import { NgIf, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, effect, inject, OnInit, signal, Type } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { WindowService } from '@core/services/window.service';
import { defaultExpenseCategories, defaultExpenseTypes } from '@shared/constants/expense-constants';
import { ResponsiveService } from '@shared/services/responsive.service';
import firebase from 'firebase/compat/app';
import { filter, switchMap } from 'rxjs';
import { UserDetails } from '../../interfaces/user-details';
import { AuthService } from '../../services/auth.service';
import { DatabaseService } from '../../services/database.service';
import { ExpenseDataService } from '../../services/expense-data.service';
import { UserService } from '../../services/user.service';
import { FooterLinksComponent } from '../footer-links/footer-links.component';
import { PageHeaderComponent } from '../page-header/page-header.component';
import { UserDetailsComponent } from '../user-details/user-details.component';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    NgTemplateOutlet,
    RouterLinkActive,
    RouterLink,
    PageHeaderComponent,
    MatMenu,
    MatMenuTrigger,
    MatMenuItem,
    FooterLinksComponent,
    NgIf,
  ],
})
export class LayoutComponent implements OnInit {
  readonly dialog = inject(MatDialog);

  userService: UserService = inject(UserService);
  user = this.userService.currentUser;
  name: UserDetails | undefined;

  breakpointObserver = inject(ResponsiveService);
  isHandset = this.breakpointObserver.isHandset;
  fixedContainer = false;
  isCompactMenuEnabled = signal(false);

  private authService: AuthService = inject(AuthService);
  private databaseService: DatabaseService = inject(DatabaseService);
  private dataService: ExpenseDataService = inject(ExpenseDataService);
  private router: Router = inject(Router);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private destroyRef: DestroyRef = inject(DestroyRef);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private readonly windowService = inject(WindowService);
  private isFirstRun = true;

  // Reflow when toggling compact menu
  private iconsOnlyEffect = effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = this.isCompactMenuEnabled();
    if (this.isFirstRun) {
      this.isFirstRun = false;
      return;
    }
    setTimeout(() => this.windowService.dispatchResizeEvent(), 100);
  });

  // When user becomes available, pull details
  private userEffect = effect(() => {
    if (this.userService.getUser()) {
      this.getAllUserDetails();
    }
  });

  ngOnInit(): void {
    this.router.events
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((event) => event instanceof NavigationEnd),
        switchMap(() => (this.route.firstChild ? this.route.firstChild.data : this.route.data)),
      )
      .subscribe((data: Record<string, string | Type<unknown>>) => {
        this.fixedContainer = Boolean(data['fixedContainer']);
      });
  }

  logout() {
    this.authService.signOut().then(() => {
      this.userService.setUser(undefined);
      this.dataService.setExpensesData([]);
      this.dataService.setTimeFrameFilter(undefined);
      this.dataService.setFilesImported([]);
      this.dataService.setCategoriesSignal([...defaultExpenseCategories]);
      this.dataService.setExpenseSourcesData([...defaultExpenseTypes]);
    });
  }

  menuClick(drawer: MatSidenav) {
    if (this.isHandset()) drawer.toggle();
  }

  toggleIconsOnly() {
    this.isCompactMenuEnabled.set(!this.isCompactMenuEnabled());
  }

  openUserDetails() {
    const dialogRef = this.dialog.open(UserDetailsComponent);
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.getAllUserDetails();
        this.snackBar.open('Profile update saved successfully!', '', { duration: 2000 });
      }
    });
  }

  /** Load the current user's details from `/users/${uid}` and hydrate state */
  private getAllUserDetails() {
    const uid = this.userService.getUser()?.uid || this.userService.getUserId();
    if (!uid) return;

    this.databaseService
      .getUserDetailsById(uid)
      .then((snapshot: firebase.database.DataSnapshot) => {
        const data = (snapshot.val() ?? {}) as {
          firstName?: string;
          lastName?: string;
          categories?: unknown;
          types?: unknown;
          filesImported?: unknown;
        };

        // Save UID in app state
        this.userService.setUserId(uid);
        this.userService.setUserDetails({
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
        });

        // Normalize arrays/objects
        const categoriesList = this.normalizeStringList(data.categories);
        const sourceTypesList = this.normalizeStringList(data.types);
        const filesImported = this.normalizeStringList(data.filesImported);

        // Apply defaults if empty
        this.dataService.setCategoriesSignal(
          categoriesList.length ? categoriesList : [...defaultExpenseCategories],
        );
        this.dataService.setExpenseSourcesData(
          sourceTypesList.length ? sourceTypesList : [...defaultExpenseTypes],
        );
        this.dataService.setFilesImported(filesImported ?? []);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.snackBar.open(`Failed to load user details: ${msg}`, '', { duration: 2500 });
      });
  }

  /** Accept array or object and return string[] */
  private normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
    }
    return [];
  }
}
