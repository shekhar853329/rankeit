import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { ToastService } from '../../core/services/toast.service';
import { SeoService } from '../../core/services/seo.service';
import { LEGAL_CONFIG } from '../../core/constants/legal.constants';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly seo = inject(SeoService);

  readonly legal = LEGAL_CONFIG;
  readonly email = LEGAL_CONFIG.supportEmail;
  readonly address = LEGAL_CONFIG.registeredAddress;
  readonly creationDate = LEGAL_CONFIG.estDate;
  readonly copied = signal(false);

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Contact Support & About the Project',
      description:
        'Connect directly with the creator of RankUp. Inquiries, listing support, partnership proposals, and transparent feedback.',
      url: 'https://rankup.cyou/contact',
    });
  }

  copyEmail(): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(this.email).then(() => {
        this.copied.set(true);
        this.toast.show('Email address copied to clipboard!', 'success');
        setTimeout(() => this.copied.set(false), 2500);
      }).catch(() => {
        this.fallbackCopy();
      });
    } else {
      this.fallbackCopy();
    }
  }

  private fallbackCopy(): void {
    const el = document.createElement('textarea');
    el.value = this.email;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    this.copied.set(true);
    this.toast.show('Email address copied to clipboard!', 'success');
    setTimeout(() => this.copied.set(false), 2500);
  }
}
