import { Component, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { RouterLink } from '@angular/router';
import { cloneDeep, includes } from 'lodash';
import { UserDataRecord } from '../core/interfaces/user-data-record';
import { DatabaseService } from '../core/services/database.service';
import { ExpenseDataService } from '../core/services/expense-data.service';
import { UserService } from '../core/services/user.service';
import { defaultExpenseCategories, defaultExpenseTypes } from '../shared/constants/expense-constants';
import { ManageOptionsComponent } from './components/manage-options/manage-options.component';
import { ChipOption } from './interfaces/chip-option';
import firebase from 'firebase/compat/app'; // for DataSnapshot typing (optional)

@Component({
  selector: 'app-expense-settings',
  imports: [
    MatCardModule,
    MatStepperModule,
    MatIcon,
    RouterLink,
    MatChipsModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    ManageOptionsComponent,
  ],
  templateUrl: './expense-settings.component.html',
  styleUrl: './expense-settings.component.scss',
})
export class ExpenseSettingsComponent implements OnInit {
  readonly expenseDataService: ExpenseDataService = inject(ExpenseDataService);

  readonly categoriesSignal = signal<ChipOption[]>([]);
  readonly copyCategoriesSignal = signal<ChipOption[]>([]);
  readonly sourceTypeSignal = signal<ChipOption[]>([]);
  readonly sourceTypeSignalOriginal = signal<ChipOption[]>([]);

  isLoadingUserInformation = signal(false);
  isLoadingUserCategories = signal(false);
  isUpdatingCategories = signal(false);
  isUpdatingSourceTypes = signal(false);

  constructor(
    private userService: UserService,
    private database: DatabaseService,
    private snackBar: MatSnackBar,
  ) {
    // When UID becomes available later in app flow
    this.userService.userIdSetAnnounced$.subscribe(() => {
      this.getAllUserDetails();
    });
  }

  ngOnInit() {
    this.getAllUserDetails();
  }

  /* -------------------- Save categories -------------------- */
  saveCategories() {
    this.isUpdatingCategories.set(true);
    const uid = this.userService.getUser()?.uid || this.userService.getUserId();
    if (!uid) {
      this.openSnackBar('No user id found.');
      this.isUpdatingCategories.set(false);
      return;
    }

    this.database
      .saveNewCategories(
        this.categoriesSignal().map((c) => c.value),
        uid,
      )
      .then(() => {
        this.expenseDataService.setCategoriesSignal(this.categoriesSignal().map((c) => c.value));
        this.copyCategoriesSignal.set(cloneDeep(this.categoriesSignal()));
        this.openSnackBar('Categories saved!');
        this.onUpdateToCategories();
        this.isUpdatingCategories.set(false);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.openSnackBar(msg);
        this.isUpdatingCategories.set(false);
      });
  }

  /* -------------------- Save source types -------------------- */
  saveTypes() {
    this.isUpdatingSourceTypes.set(true);
    const uid = this.userService.getUser()?.uid || this.userService.getUserId();
    if (!uid) {
      this.openSnackBar('No user id found.');
      this.isUpdatingSourceTypes.set(false);
      return;
    }

    this.database
      .saveNewExpenseSourceTypes(
        this.sourceTypeSignal().map((t) => t.value),
        uid,
      )
      .then(() => {
        this.sourceTypeSignalOriginal.set(cloneDeep(this.sourceTypeSignal()));
        this.expenseDataService.setExpenseSourcesData(this.sourceTypeSignal().map((t) => t.value));
        this.openSnackBar('Expense Source Types saved!');
        this.isUpdatingSourceTypes.set(false);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.openSnackBar(msg);
        this.isUpdatingSourceTypes.set(false);
      });
  }

  /* -------------------- Load user details -------------------- */
  private getAllUserDetails() {
    const user = this.userService.getUser();
    const uid = user?.uid || this.userService.getUserId();
    if (!uid) {
      return; // not signed in yet
    }

    this.isLoadingUserInformation.set(true);
    this.isLoadingUserCategories.set(true);

    this.database
      .getUserDetailsById(uid)
      .then((snapshot: firebase.database.DataSnapshot) => {
        const data = (snapshot.val() ?? {}) as UserDataRecord | Record<string, unknown>;

        // In older versions you queried /users by email and then picked the first key.
        // Now the snapshot is already at /users/${uid}, so set it directly:
        this.userService.setUserId(uid);

        // Normalize categories/types whether stored as array or object
        const categoriesList = this.normalizeStringList((data as any)?.categories);
        const sourceTypesList = this.normalizeStringList((data as any)?.types);

        this.setCategoriesOptions(categoriesList.length ? categoriesList : [...defaultExpenseCategories]);
        this.setSourceTypeOptions(sourceTypesList.length ? sourceTypesList : [...defaultExpenseTypes]);

        this.isLoadingUserInformation.set(false);
        this.isLoadingUserCategories.set(false);
      })
      .catch((e: unknown) => {
        this.isLoadingUserInformation.set(false);
        this.isLoadingUserCategories.set(false);
        const msg = e instanceof Error ? e.message : String(e);
        this.openSnackBar(`Error! ${msg}.`);
      });
  }

  /* -------------------- Helpers -------------------- */

  /** Accept array or object and return string[] */
  private normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return (value as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
    return [];
    }

  private setCategoriesOptions(categoriesArr: string[]) {
    const categories = categoriesArr.map((category) => ({
      value: category,
      removable: !includes(defaultExpenseCategories, category),
    }));
    this.categoriesSignal.set([...categories]);
    this.copyCategoriesSignal.set([...categories]);
    this.expenseDataService.setCategoriesSignal(categoriesArr);
    this.onUpdateToCategories();
  }

  private setSourceTypeOptions(sourceTypes: string[]) {
    const expenseSourceTypes = sourceTypes.map((type) => ({
      value: type,
      removable: !includes(defaultExpenseTypes, type),
    }));
    this.sourceTypeSignal.set([...expenseSourceTypes]);
    this.sourceTypeSignalOriginal.set([...expenseSourceTypes]);
  }

  private onUpdateToCategories() {
    this.database.announceCategoriesAdded('Categories Added');
  }

  private openSnackBar(message: string) {
    this.snackBar.open(message, '', { duration: 2000 });
  }
}
