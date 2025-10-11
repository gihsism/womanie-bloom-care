import { Star } from 'lucide-react';

const Testimonials = () => {
  const testimonials = [
    {
      quote:
        "Womanie helped me finally understand my cycles after years of confusion. The AI insights are incredibly accurate, and being able to message my doctor directly has been game-changing.",
      name: 'Sarah M.',
      age: 32,
      context: 'Conception Journey',
    },
    {
      quote:
        "As someone going through IVF, having everything in one place - medications, appointments, emotions - has reduced so much stress. The community support is invaluable.",
      name: 'Jessica L.',
      age: 38,
      context: 'IVF Journey',
    },
    {
      quote:
        "I wish I had Womanie when I started menopause. The symptom tracking helps me communicate better with my doctor, and the educational content is evidence-based and reassuring.",
      name: 'Patricia K.',
      age: 52,
      context: 'Menopause Transition',
    },
  ];

  return (
    <section className="py-16 lg:py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold mb-4">
            Trusted by Women Everywhere
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Hear from real women who've transformed their health journey with Womanie
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-background rounded-2xl p-8 shadow-sm border border-border hover:shadow-lg transition-shadow"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 fill-primary text-primary"
                  />
                ))}
              </div>
              <p className="text-foreground mb-6 leading-relaxed italic">
                "{testimonial.quote}"
              </p>
              <div className="border-t border-border pt-4">
                <p className="font-semibold">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">
                  {testimonial.age} • {testimonial.context}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
