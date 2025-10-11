import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, User, ArrowRight } from 'lucide-react';

const Blog = () => {
  const navigate = useNavigate();

  const articles = [
    {
      title: 'Understanding Your Menstrual Cycle: A Complete Guide',
      excerpt: 'Learn about the four phases of your cycle and how to track them effectively for better health insights.',
      author: 'Dr. Sarah Johnson',
      date: 'March 15, 2024',
      category: 'Cycle Health',
      readTime: '8 min read',
    },
    {
      title: '10 Signs of Ovulation You Shouldn\'t Ignore',
      excerpt: 'Discover the key indicators of ovulation and how to use them to optimize your fertility window.',
      author: 'Dr. Emily Chen',
      date: 'March 12, 2024',
      category: 'Fertility',
      readTime: '6 min read',
    },
    {
      title: 'PCOS: Symptoms, Diagnosis, and Management',
      excerpt: 'A comprehensive guide to understanding and managing Polycystic Ovary Syndrome with lifestyle and medical interventions.',
      author: 'Dr. Maria Rodriguez',
      date: 'March 10, 2024',
      category: 'Conditions',
      readTime: '12 min read',
    },
    {
      title: 'Nutrition for Hormonal Balance',
      excerpt: 'How diet affects your hormones and what foods to eat for optimal menstrual health and energy.',
      author: 'Lisa Thompson, RD',
      date: 'March 8, 2024',
      category: 'Nutrition',
      readTime: '10 min read',
    },
    {
      title: 'Navigating Perimenopause: What to Expect',
      excerpt: 'Understanding the transition to menopause and how to manage symptoms for a smoother journey.',
      author: 'Dr. Jennifer Lee',
      date: 'March 5, 2024',
      category: 'Menopause',
      readTime: '9 min read',
    },
    {
      title: 'Mental Health and Your Cycle: The Connection',
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Women's Health Blog
            </h1>
            <p className="text-xl text-muted-foreground">
              Expert insights, evidence-based advice, and community stories
              to support your health journey.
            </p>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant="outline"
                className="whitespace-nowrap"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <Card key={article.title} className="overflow-hidden flex flex-col">
                <div className="h-48 bg-muted"></div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                    <span className="text-primary font-medium">{article.category}</span>
                    <span>•</span>
                    <span>{article.readTime}</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-3 line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-muted-foreground mb-4 line-clamp-3 flex-1">
                    {article.excerpt}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{article.author}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{article.date}</span>
                    </div>
                  </div>
                  <Button className="w-full mt-4 gap-2">
                    Read More
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Load More */}
          <div className="text-center mt-12">
            <Button variant="outline" size="lg">
              Load More Articles
            </Button>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <Card className="p-8 max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Stay Informed</h2>
            <p className="text-muted-foreground mb-6">
              Get the latest women's health insights, tips, and research delivered to your inbox weekly.
            </p>
            <div className="flex gap-2 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 rounded-md border border-input bg-background"
              />
              <Button>Subscribe</Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Blog;
