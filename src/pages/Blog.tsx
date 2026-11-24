import { useState } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { PublicHero, PublicSection } from '@/components/public/PublicUI';

const Blog = () => {
  usePageTitle('Blog');
  const [category, setCategory] = useState('All Articles');

  const articles = [
    {
      title: 'Understanding your menstrual cycle: a complete guide',
      excerpt: 'Learn about the four phases of your cycle and how to track them effectively for better health insights.',
      author: 'Dr. Sarah Johnson',
      date: 'March 15, 2024',
      category: 'Cycle Health',
      readTime: '8 min read',
    },
    {
      title: '10 signs of ovulation you shouldn\'t ignore',
      excerpt: 'Discover the key indicators of ovulation and how to use them to optimize your fertility window.',
      author: 'Dr. Emily Chen',
      date: 'March 12, 2024',
      category: 'Fertility',
      readTime: '6 min read',
    },
    {
      title: 'PCOS: symptoms, diagnosis and management',
      excerpt: 'A comprehensive guide to understanding and managing Polycystic Ovary Syndrome with lifestyle and medical interventions.',
      author: 'Dr. Maria Rodriguez',
      date: 'March 10, 2024',
      category: 'Conditions',
      readTime: '12 min read',
    },
    {
      title: 'Food for hormonal balance',
      excerpt: 'How diet affects your hormones and what foods to eat for optimal menstrual health and energy.',
      author: 'Lisa Thompson, RD',
      date: 'March 8, 2024',
      category: 'Nutrition',
      readTime: '10 min read',
    },
    {
      title: 'Perimenopause: what to expect',
      excerpt: 'Understanding the transition to menopause and how to manage symptoms for a smoother journey.',
      author: 'Dr. Jennifer Lee',
      date: 'March 5, 2024',
      category: 'Menopause',
      readTime: '9 min read',
    },
    {
      title: 'Mental health and your cycle',
      excerpt: 'Exploring the relationship between hormonal fluctuations and mood, anxiety, and mental wellbeing.',
      author: 'Dr. Amanda White',
      date: 'March 1, 2024',
      category: 'Mental Health',
      readTime: '7 min read',
    },
  ];

  const categories = [
    'All Articles',
    'Cycle Health',
    'Fertility',
    'Pregnancy',
    'Menopause',
    'Mental Health',
    'Nutrition',
    'Conditions',
  ];

  const shown = category === 'All Articles' ? articles : articles.filter((a) => a.category === category);

  // The page's one action: the working newsletter sign-up in the footer
  // (this page had its own Subscribe button that did nothing).
  const toNewsletter = () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Email address for newsletter"]');
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <PublicHero
          title="Women's health blog"
          sub="Expert insights, advice based on evidence, and stories from our community."
          cta={{ label: 'Get new articles by email', onClick: toNewsletter }}
        />

        <section className="px-4">
          <div className="mx-auto max-w-3xl">
            <div role="radiogroup" aria-label="Topic" className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 min-h-11 rounded-full border px-4 text-[15px] font-semibold transition-colors ${
                    category === c ? 'border-stage-accent bg-stage-tint text-stage-ink' : 'border-line bg-card hover:bg-muted/60'
                  }`}
                >
                  {c === 'All Articles' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
        </section>

        <PublicSection className="pt-6 pb-16">
          {shown.length === 0 ? (
            <div className="panel px-5 py-8 text-center">
              <p className="text-[16px] font-bold">No articles about {category.toLowerCase()} yet</p>
              <p className="mt-1 text-[15px] text-muted-foreground">New articles are on the way.</p>
            </div>
          ) : (
            <div className="row-group">
              {shown.map((article) => (
                <article key={article.title} className="px-4 py-5">
                  <p className="text-[14px] text-muted-foreground">
                    <span className="font-semibold text-stage-accent">{article.category}</span> · {article.readTime}
                  </p>
                  <h2 className="mt-1 text-[18px] font-bold leading-snug">{article.title}</h2>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{article.excerpt}</p>
                  <p className="mt-2.5 text-[14px] text-muted-foreground">
                    {article.author} · {article.date} · <span className="font-semibold">Coming soon</span>
                  </p>
                </article>
              ))}
            </div>
          )}
        </PublicSection>
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
